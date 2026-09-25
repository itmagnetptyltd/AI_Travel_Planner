# Plan — Slice 5 Save and reopen

Covers REQ-TRV-017@v1, REQ-TRV-018@v1, REQ-TRV-019@v1, REQ-TRV-097@v1. All `agreed`.
Branch `feat/trv-save-reopen`, stacked on `feat/trv-plan-generation` until slice 4 merges.
Gate: slice 4 Done (10/10).

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded
governs this plan and no rejected approach is being re-proposed. The glossary already
says a Trip becomes Planned "once a Plan is generated and saved" and that each
generation "makes a new Plan version"; this plan follows both.

**Status: proposal. Nothing is built. Three items under "Needs your decision" should be
answered before `/tdd`.**

---

## Needs your decision before /tdd

### 1. Is saving automatic?

REQ-TRV-017 says "a Plan is generated for it *and saved*". ANSWERS.md and the glossary say
every generation creates a new Plan version. Read together, saving is what generation
already does, not a second step.

I propose: **a successful generation saves itself as a new Plan version, and the Trip
becomes Planned in the same step.** There is no Save button. This also removes the slice 4
weakness where reloading lost a Plan the Traveler had spent a generation on.

The alternative is a Generate button that shows an unsaved Plan and a separate Save button.
That adds a state ("shown but not saved") nobody has asked for, and a Traveler can lose a
paid-for Plan by not pressing it. Your call.

### 2. Generating again on a Trip that has a Plan

REQ-TRV-018 needs a Trip "generated and then regenerated" to hold versions 1 and 2. So in
this slice, pressing Generate Plan on a Trip that already has a Plan produces a new version
that becomes current, and the earlier one stays in the version list.

What this slice does **not** build, because it belongs to slice 7 (REQ-TRV-041, 042): the
warning that hand edits will be replaced, the Regenerate wording, and regenerating a single
Day. Nothing in slice 5 can create a hand edit, so no warning is needed yet. Slice 7 wraps
the same call in its warning.

### 3. How the browser test reaches a past Trip (REQ-TRV-097, belt B)

The Trip form refuses a start date before today, so a browser test cannot create a Trip whose
dates have passed. I propose the e2e helper writes that Trip and its Plan straight into the
e2e SQLite file with `better-sqlite3` (already a dependency), then opens it in the browser.
The API and unit tests use a fixed clock instead. The alternative is leaving belt B for 097
uncovered, which blocks closing the slice.

---

## What must be true

### REQ-TRV-017 — a generated Plan is saved with its Trip (A B C)
1. A Draft Trip with no Plan, once a Plan is generated for it, is listed as Planned, and the Plan is shown when the Trip is reopened.
2. A Trip with no Plan that has one Plan generated and saved has a version list of exactly one version.

### REQ-TRV-018 — reopening shows the Plan exactly as last saved (A B C)
1. A saved Trip whose Plan has 8 Days and a known set of Activities shows the same 8 Days and the same Activities after the Traveler logs out, logs in and opens it.
2. A Trip whose Plan was generated and then regenerated: restoring the first version shows the first version's Plan, and the version list holds three versions, none removed.
3. A Trip that already has 10 versions and gets an 11th: the list holds 10 and the oldest is no longer listed.

### REQ-TRV-019 — saved Trips survive a restart (A C)
1. With a saved Trip and Plan, stopping and starting the application and requesting the Trip as its owner returns the Trip and its Plan unchanged.

### REQ-TRV-097 — a past Trip still opens with its Plan (A B C)
1. Today being 2026-09-23, a saved Trip that ran from 2026-09-01 to 2026-09-05 opens for its owner showing the Trip and its Plan.

---

## Approach

A Plan version is a **snapshot of the whole Plan**, stored as JSON on one row. Every version
is complete on its own, so restoring is a copy, the cap is a delete of the oldest row, and
"exactly as last saved" is true by construction. Slice 7 (edits) and slice 10 (cost
estimates "stored with the Plan version") extend the snapshot without changing the tables.

**Data** — migration `0004_plan_versions.sql`
- `plan_versions`: `id`, `trip_id` (foreign key to `trips`), `version_number`, `source`, `plan_json`, `created_at`. Unique on `(trip_id, version_number)`.
- `source` is `generation` or `restore` for now. Slices 7 and 8 add their own values.
- Version numbers only go up and are never reused, so a removed version 1 does not let a later save become version 1 again.

**Store** — `src/server/plans/plan-store.ts`
- `save(tripId, plan, source)` inserts the next version, deletes the oldest beyond 10, and sets the Trip to Planned, all in one transaction.
- `current(tripId)`, `listVersions(tripId)` newest first, and `restore(tripId, versionNumber)`.
- Restore inserts a **new** version copying the chosen one. Nothing is overwritten (ANSWERS.md, "One Plan per Trip").
- A snapshot read back from the database is parsed with a zod schema, not trusted.

**Service** — `plan-service.generate` saves through the store in the same transaction that settles the AI record, so a Plan is either saved with its record or not at all. Its result gains the version number.

**Routes** — all owner-only; a Trip that is absent, deleted or someone else's gets the same 404 as today.
- `POST /api/trips/:id/plan` — unchanged, and its body gains `version` and `createdAt`. Additive, so slice 4's tests still hold.
- `GET /api/trips/:id/plan` — the current Plan. 404 `PLAN_NOT_FOUND` when the Trip has none.
- `GET /api/trips/:id/plan/versions` — `[{ version, createdAt, source }]`, newest first.
- `POST /api/trips/:id/plan/versions/:version/restore` — 201 with the new current Plan, 404 for an unknown version.

**Web**
- `TripPage` loads the current Plan when it opens and shows it. `PlanGenerator` keeps the shown Plan separate from its message, so a refusal or a failure no longer hides the saved Plan.
- New `PlanVersions`: the version list, "current" marked, and a Restore button on each earlier version.
- The Trip list already shows status; a Trip now reads Planned once it has a Plan.

**Files (new):** `src/server/plans/plan-store.ts`, `src/server/db/migrations/0004_plan_versions.sql` (with snapshot and journal entry), `src/web/components/PlanVersions.tsx`, `e2e/save-reopen.spec.ts`, `e2e/support/seed-past-trip.ts`, and the test files below.
**Files (changed):** `db/schema.ts`, `plans/plan-service.ts`, `plans/plan-routes.ts`, `app.ts`, `shared/plan-schemas.ts`, `web/components/PlanGenerator.tsx`, `web/pages/TripPage.tsx`, `web/pages/plan-view-state.ts`, `tests/support/build-test-app.ts` (a database path option, so a test can restart the application over one file).

---

## Test skeleton

One test per criterion at least. Belts: A = `tests/unit/*.test.ts`, C = `tests/api/*.http.spec.ts`, B = `e2e/*.spec.ts`.

### `tests/unit/plan-store.test.ts` (A)
- `// @covers REQ-TRV-017@v1` — saving the first Plan of a Draft Trip makes the Trip Planned and gives a version list of exactly one
- `// @covers REQ-TRV-018@v1` — a saved 8-Day Plan reads back with the same Days and Activities
- `// @covers REQ-TRV-018@v1` — restoring the first of two versions makes its Plan current and leaves three versions, none removed
- `// @covers REQ-TRV-018@v1` — saving an 11th version leaves 10 and drops the oldest
- `// @covers REQ-TRV-018@v1` — a version number is never reused after the oldest is dropped
- `// @covers REQ-TRV-097@v1` — the current Plan is still returned once the clock is past the Trip's end date
- `// @covers REQ-TRV-019@v1` — a Plan saved to a database file is returned unchanged after the file is closed and reopened
- `// @covers REQ-TRV-018@v1` — a snapshot that no longer matches the Plan shape is refused when read, not shown

### `tests/unit/plan-service.test.ts` (A, additions)
- `// @covers REQ-TRV-017@v1` — a successful generation saves a version and makes the Trip Planned
- `// @covers REQ-TRV-017@v1` — a failed generation saves nothing and leaves the Trip Draft
- `// @covers REQ-TRV-018@v1` — a second generation adds version 2 and keeps version 1

### `tests/api/plan-versions.http.spec.ts` (C)
- `// @covers REQ-TRV-017@v1` — after generating, GET /api/trips lists the Trip as Planned and GET /api/trips/:id/plan returns the Plan
- `// @covers REQ-TRV-017@v1` — the first generation gives a version list of exactly one version
- `// @covers REQ-TRV-018@v1` — after logging out and in, the Trip's Plan has the same 8 Days and Activities
- `// @covers REQ-TRV-018@v1` — restoring version 1 of two makes it current and the list holds three versions
- `// @covers REQ-TRV-018@v1` — an 11th generation leaves 10 versions and drops version 1
- `// @covers REQ-TRV-019@v1` — a new application started over the same database file returns the Trip and its Plan unchanged, for the same session
- `// @covers REQ-TRV-097@v1` — a Trip created earlier, opened once its dates have passed, returns the Trip and its Plan
- `GET plan`, `GET versions` and `restore` give a Trip that is absent, deleted or someone else's the same 404, and 401 when not logged in (supplementary, security)
- restoring a version that does not exist gives 404 and changes nothing (supplementary)

### `e2e/save-reopen.spec.ts` (B)
- `// @covers REQ-TRV-017@v1` — a Traveler generates a Plan, reloads the page, sees the Plan, and sees the Trip listed as Planned
- `// @covers REQ-TRV-017@v1` — the version list shows one version after the first generation
- `// @covers REQ-TRV-018@v1` — a Traveler logs out, logs in and opens the Trip, and sees the same 8 Days and Activities
- `// @covers REQ-TRV-018@v1` — after generating twice, restoring the first version shows its Plan and lists three versions
- `// @covers REQ-TRV-018@v1` — after generating 11 times the list shows 10 versions and no Version 1
- `// @covers REQ-TRV-097@v1` — a Trip whose dates have passed, seeded into the database, opens showing the Trip and its Plan

### Existing tests that must stay green
Slice 4's browser tests: a failed or refused generation still shows the message, and the fallback path still offers no way to build a Plan by hand.

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend the first two.

1. **A snapshot per version, stored as JSON, not normalised rows for Days and Activities.** Normalised rows would need copying on every save and restore, and cannot express "exactly as last saved" without extra care. The cost is that Activities are not individually queryable. Nothing in the requirements queries them across Trips.
2. **Generation saves automatically** (item 1 above).
3. **Restore creates a new version** rather than moving a "current" pointer. This is what ANSWERS.md says; recording it stops slice 7 undoing it.

## What I am unsure about

- **The 10-version cap during a restore.** Restoring with 10 versions in place creates version 11 and drops version 1. If the Traveler restored version 1, its content survives as version 11, so nothing is lost, but the list no longer shows the original version 1.
- **`source` values.** I use `generation` and `restore`. Slices 7 and 8 will add edit, regeneration and chat values; I am naming only what exists.
- **Time zone of the version list.** Times are shown in UTC, matching how the rest of the application counts days. The client has not said which zone they expect.
- **A Plan on a Trip whose dates are later edited.** This slice shows the stored Plan as saved. Adjusting Days when dates change is REQ-TRV-098 in slice 7.
- **Deleting a Trip.** A deleted Trip's Plans are unreachable to the owner (the same 404) but are not purged. The 30-day purge is REQ-TRV-099 in slice 8.
- **Viewing an old version without restoring it.** No criterion asks for it, so it is not built. Restore is the only way to see an earlier version, which is a real usability limit.
- **The e2e database seam** (item 3) writes into a running server's SQLite file. WAL mode allows a second connection, but it is a test-only path around the application, and I would keep it to that one helper.

## Review triggers

This touches stored user data and new owner-only endpoints, so **security-reviewer** runs before the commit, and **typescript-reviewer** and **code-reviewer** after `/tdd`.

## Then

Waiting for you. Answer the three items at the top, or say "I approve" to take my recommendations, then run `/tdd REQ-TRV-017 REQ-TRV-018 REQ-TRV-019 REQ-TRV-097`.
