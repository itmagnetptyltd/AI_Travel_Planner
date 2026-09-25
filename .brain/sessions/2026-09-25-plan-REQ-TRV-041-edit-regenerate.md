# Plan — Slice 7 Edit and regenerate

Covers REQ-TRV-041@v1, 042@v1, 043@v1, 045@v1, 046@v1, 047@v1, 048@v1, 094@v1,
098@v1, 102@v1, 103@v1. All `agreed`.
Branch `feat/trv-edit-regenerate`, stacked on `feat/trv-preferences` until slice 6 merges.
Gate: slice 6 Done (8/8).

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded
governs this plan and no rejected approach is being re-proposed. ANSWERS.md already settles the
hard questions: regenerating **replaces** hand edits after a warning ("Regeneration and the
Traveler's own edits"); a replacement comes from the AI **or** the Traveler typing ("Where does a
replacement Activity come from?"); "section" means Day ("What is a 'section'?"); and what happens
to a Plan when Trip details change ("Changing Trip details after a Plan exists").

**Status: proposal. Nothing is built. Four items under "Needs your decision" should be
answered before `/tdd`. This slice is large; the plan says how I would build it in order.**

---

## Needs your decision before /tdd

### 1. Give every Activity a stable identifier

Edit, remove, move and replace each have to say *which* Activity. Today an Activity is only
"the third one on Day 2", which changes as soon as another is removed or moved. I propose **each
Activity carries an `id`** (a UUID made when the Plan is generated or an Activity is added).

Plans saved in slices 5 and 6 have no ids. I propose the reader **gives them ids as they are read**
(`day-2-activity-3`, the same every time for that version), so nothing already saved breaks and no
data migration is needed. The alternative is addressing by day and position, which is fragile
under concurrent edits.

### 2. What counts as "changed by hand"

The warnings in REQ-TRV-041 and 042 depend on knowing which Activities the Traveler changed. I
propose an Activity gets `changedByHand: true` when the Traveler **edits it, replaces it with one
they typed, or moves it**. An AI suggestion the Traveler accepts is **not** hand-changed (the AI
wrote it), and **removing** an Activity leaves nothing to mark, so a Day whose only difference is a
removal gets no warning. That is a gap: regenerating would put the removed Activity back without
saying so. The requirements are silent on both. Your call.

### 3. Changing the Destination of a Trip that has a Plan

The Plan must be regenerated (ANSWERS.md), the Traveler must be warned first, and it needs the AI.
If the AI is down when they confirm, either the Destination changes and the Plan is left stale, or
nothing changes. I propose **nothing changes**: the change is refused with the fallback message, so
a Trip is never left showing Kyoto over a Tokyo Plan. The cost is that the Traveler cannot change
the Destination while the AI is unavailable.

The same confirm step serves every warned action: the first request answers `409` and says what
would happen; the Traveler confirms and the same request is sent again with a confirm flag.

### 4. Button wording, and what that does to earlier tests

Once a Trip has a Plan, "Generate Plan" becomes **Regenerate Plan**, and each Day gets **Regenerate
Day N**, matching REQ-TRV-042's "offered for the whole Plan and for each single Day". The browser
tests from slices 4 and 5 click a button named "Generate Plan" in many places. I would change the
one shared helper (`generatePlan` in `e2e/support/plan-journeys.ts`) to click either name. No
requirement changes.

---

## What must be true

### REQ-TRV-041 — regenerate the whole Plan (A B C)
1. Regenerating a Trip with a Plan shows the Plan the AI double returned.
2. With an Activity changed by hand, choosing to regenerate shows a warning that manual edits will be replaced, before any request reaches the double.
3. Confirming shows the double's Plan, and the hand-changed Activity is not in it.
4. A Traveler at 20 generations today is refused with the reset time, and the Plan is unchanged.
5. The previous Plan stays in the version list and can be restored.

### REQ-TRV-042 — regenerate a single Day (A B C)
1. Regenerating Day 4 of an 8-Day Plan leaves every other Day's Activities identical.
2. Regeneration is offered for the whole Plan and for each Day, and not for a single Activity.
3. Day 4 holding a hand-changed Activity: choosing to regenerate it warns before any request is sent.
4. With hand-changed Activities on Day 4 and Day 5, regenerating Day 4 and confirming replaces Day 4's and leaves Day 5's.

### REQ-TRV-043 — regeneration uses the current preferences (A C)
1. A Trip with travel style Adventure and interests Nature: the regeneration request contains both.
2. After regeneration the Trip still has travel style Adventure and interests Nature.

### REQ-TRV-045 — edit an Activity (A B C)
1. Changing an Activity from 10:00 to 11:00 and saving shows it at 11:00 when the Trip is reopened.

### REQ-TRV-046 — remove an Activity (A B C)
1. Removing an Activity takes it off its Day.

### REQ-TRV-047 — replace an Activity (A B C)
1. Replacing P leaves P off the Day and a different Activity in its place.
2. Asking the AI for a replacement (the double returns Q) and accepting it puts Q where P was.
3. Typing an Activity with a start time, duration, location and estimated cost puts it where P was.
4. A Traveler at 20 generations today is refused an AI suggestion, with the reset time.
5. The same Traveler can still replace P by typing their own Activity.

### REQ-TRV-048 — move an Activity to another Day (A B C)
1. Moving an Activity from Day 2 to Day 5 shows it on Day 5 and not on Day 2.
2. Day 5 holding five Activities, plus a 12:00 Activity moved in, holds six, ordered by start time.

### REQ-TRV-094 — a Trip keeps working after its Destination is disabled (A B C)
1. A saved Kyoto Trip with a Plan, after Kyoto is disabled: the owner opens it and regenerates. It still shows Kyoto and the regenerated Plan.

### REQ-TRV-098 — changing a Trip that has a Plan (A B C)
1. Changing the Destination to Kyoto warns that the Plan will be regenerated; the Trip and Plan are unchanged until the owner confirms.
2. Confirming sends the AI a request for Kyoto, and the Trip shows the Plan it returned.
3. Shortening an 8-Day Trip to 5 Days warns that Days 6 to 8 will be dropped, before the change is saved.
4. Confirming leaves a Plan of 5 Days with the same Activities as the former Days 1 to 5, in order.
5. Lengthening it to 10 Days keeps Days 1 to 8 as they were, adds Days 9 and 10 empty, and offers to generate them.
6. Moving 2026-10-10 to 2026-10-17 to 2026-10-12 to 2026-10-19 dates Day 1 as 2026-10-12 with the former Day 1's Activities, and every later Day follows.
7. Changing adults or budget leaves the Plan unchanged and shows a banner suggesting regenerating or re-estimating.

### REQ-TRV-102 — a failed regeneration keeps the saved Plan (A B C)
1. With a saved Plan and an AI error, asking to regenerate shows the unavailable message and the earlier Plan is still displayed.

### REQ-TRV-103 — editing works while the AI is down (A B C)
1. With an AI that does not respond, editing one Activity, removing another and moving a third are all saved and shown when the Trip is reopened.

---

## Approach

The Plan is already a versioned JSON snapshot (slice 5). Every operation here is: take the current
snapshot, produce a new one, save it as the next version. So the core is a set of **pure functions
on a Plan**, tested without a database, with thin services and routes around them.

**Plan model** — `src/shared/plan-schemas.ts`
- `PlanActivity` gains `id` and `changedByHand`. `PlanView` gains an optional `basis` (`adults`, `children`, `budget` when the Plan was made) so the banner in REQ-TRV-098 crit 7 can tell the Trip has moved on. `PlanVersionSource` adds `edit`, `day-regeneration` and `trip-change`.
- The read schema fills a missing `id` and `changedByHand` (see item 1), so older versions still open.

**Pure Plan operations** — `src/server/plans/plan-edit.ts` (new)
`editActivity`, `removeActivity`, `moveActivity` (re-sorted by start time), `replaceActivity`,
`replaceDay`, `adjustToDates` (keep Days in order, drop the excess, add empty Days, re-date from the
new start), and `handChangedIn(plan, scope)` where the scope is the whole Plan or one Day. Every one
returns a new Plan and never changes its input.

**Services**
- `plan-service.ts` is split: it is near the size limit. Generation stays; the new AI calls (`regenerateDay`, `suggestReplacement`) go in `plan-regeneration-service.ts`, and the manual operations in `plan-editor-service.ts`. Shared pieces (reserving a generation, calling the AI within the timeout, settling the record) move to `ai-call.ts` rather than being copied.
- The daily limit counts every AI call that makes a Plan or part of one: whole Plan, Day, and an Activity suggestion (ANSWERS.md, "Limits on AI use"). `AI_REQUEST_KINDS` gains `day-regeneration` and `activity-suggestion`, and the limit counts all three. Typed replacements, edits, removals and moves are free.
- The Day request asks the AI for one Day (its number and date) with the same Trip details and preferences as the whole-Plan request. It does not list the other Days' Activities, so a regenerated Day can repeat one.
- `trip-change-service.ts` (new) decides what a change to a Trip with a Plan does: destination changed means regenerate; dates changed means `adjustToDates`; adults, children or budget changed means leave the Plan alone; anything else means nothing. It saves the Trip change and the new Plan version in one transaction. For a Destination change it asks the AI **first** and saves both together only if it answers (item 3).

**Routes** (owner-only; a Trip that is absent, deleted or someone else's gets the same 404)
- `PATCH /api/trips/:id/plan/activities/:activityId` edit (045)
- `DELETE /api/trips/:id/plan/activities/:activityId` remove (046)
- `POST /api/trips/:id/plan/activities/:activityId/move` with `{ toDay }` (048)
- `POST /api/trips/:id/plan/activities/:activityId/replace` with the new Activity (047 crit 1, 3, 5)
- `POST /api/trips/:id/plan/activities/:activityId/suggestion` returns an AI suggestion without saving it (047 crit 2, 4); accepting it is a replace
- `POST /api/trips/:id/plan/days/:dayNumber/regenerate` (042)
- `POST /api/trips/:id/plan` (existing) now needs `{ confirmReplaceEdits: true }` when hand-changed Activities would be replaced, and answers `409 EDITS_WOULD_BE_REPLACED` otherwise (041, 042 crit 3)
- `PATCH /api/trips/:id` (existing) answers `409 PLAN_CHANGE_NEEDS_CONFIRMATION` with what would happen, and needs `{ confirmPlanChange: true }` to apply it (098)
- Each new mutating route saves one new version.

**Web**
- `PlanDisplay` gets per-Activity Edit, Replace (type your own, or Ask the AI), Move to day and Remove, and per-Day Regenerate Day. Regeneration is offered for the whole Plan and each Day only, never for one Activity.
- A confirm dialog for `409` warnings (hand edits replaced; Trip change), and a banner on the Trip page when the Trip's adults or budget differ from the Plan's `basis`, and an offer to generate each empty Day.
- `PlanGenerator` keeps the saved Plan on show when regeneration fails (REQ-TRV-102); slice 5 already does this for a failed generation.

**Files (new):** `src/server/plans/{plan-edit,plan-editor-service,plan-regeneration-service,ai-call,plan-edit-routes}.ts`, `src/server/trips/trip-change-service.ts`, `src/web/components/{ActivityEditor,ConfirmDialog,PlanBanner}.tsx`, and the test files below.
**Files (changed):** `shared/plan-schemas.ts`, `shared/ai-limits.ts`, `plans/plan-service.ts`, `plans/plan-store.ts`, `plans/plan-prompt.ts`, `plans/plan-reply.ts`, `plans/plan-routes.ts`, `trips/trip-routes.ts`, `app.ts`, `db/schema.ts` (the request kinds), `web/components/{PlanDisplay,PlanGenerator}.tsx`, `web/pages/{TripPage,TripFormPage,trip-form-state}.ts(x)`, and `e2e/support/plan-journeys.ts`.

No migration is needed for the Plan itself (it is JSON). The new request kinds are a text column, so none there either.

---

## Test skeleton

One test per criterion at least. Belts: A = `tests/unit/*.test.ts`, C = `tests/api/*.http.spec.ts`, B = `e2e/*.spec.ts`.

### `tests/unit/plan-edit.test.ts` (A) — the pure operations
- `// @covers REQ-TRV-045@v1` — changing an Activity's time from 10:00 to 11:00 leaves the rest of the Plan as it was, and marks it changed by hand
- `// @covers REQ-TRV-045@v1` — editing re-sorts the Day by start time
- `// @covers REQ-TRV-046@v1` — removing an Activity takes it off its Day and touches nothing else
- `// @covers REQ-TRV-048@v1` — moving an Activity from Day 2 to Day 5 takes it off Day 2 and puts it on Day 5
- `// @covers REQ-TRV-048@v1` — a 12:00 Activity moved onto a Day of five leaves six, ordered by start time
- `// @covers REQ-TRV-047@v1` — replacing P puts a different Activity in its place, marked changed by hand when typed and not when it came from the AI
- `// @covers REQ-TRV-042@v1` — replacing Day 4 leaves every other Day identical
- `// @covers REQ-TRV-041@v1` — the hand-changed Activities in scope are found for the whole Plan and for one Day
- `// @covers REQ-TRV-098@v1` — an 8-Day Plan adjusted to 5 Days keeps Days 1 to 5 with the same Activities in order
- `// @covers REQ-TRV-098@v1` — adjusted to 10 Days keeps Days 1 to 8 and adds two empty Days
- `// @covers REQ-TRV-098@v1` — moving the dates re-dates Day 1 to the new start and keeps every Activity on the same numbered Day
- every operation leaves its input Plan unchanged (supplementary)
- an unknown Activity or Day gives a refusal, not an exception (supplementary)

### `tests/unit/plan-editor-service.test.ts` (A)
- `// @covers REQ-TRV-045@v1` — an edit saves a new version, the earlier stays in the list, and the Trip reads the edit back
- `// @covers REQ-TRV-046@v1` — a removal saves a new version
- `// @covers REQ-TRV-048@v1` — a move saves a new version
- `// @covers REQ-TRV-047@v1` — typed replacement at 20 generations today still saves, and sends the AI nothing
- `// @covers REQ-TRV-103@v1` — edit, remove and move all save with an AI that never answers, and the double is not called
- `// @covers REQ-TRV-047@v1` — an invalid edit (a time that is not HH:MM, a negative cost) is refused and saves nothing

### `tests/unit/plan-regeneration-service.test.ts` (A)
- `// @covers REQ-TRV-041@v1` — regenerating shows the double's different Plan, and the old Plan stays in the version list and can be restored
- `// @covers REQ-TRV-041@v1` — with a hand-changed Activity, regenerating without confirming returns the warning and the double receives nothing
- `// @covers REQ-TRV-041@v1` — confirming replaces the Plan and the hand-changed Activity is gone
- `// @covers REQ-TRV-041@v1` — at 20 generations today it is refused with the reset time and the Plan is unchanged
- `// @covers REQ-TRV-042@v1` — regenerating Day 4 of 8 leaves every other Day identical, and the request names Day 4 and its date
- `// @covers REQ-TRV-042@v1` — a hand-changed Activity on Day 4 warns before any request; confirming replaces Day 4's and leaves Day 5's
- `// @covers REQ-TRV-042@v1` — a regenerated Day with no Activity, or the wrong Day, is refused as an AI failure and saves nothing
- `// @covers REQ-TRV-043@v1` — the request carries Adventure and Nature, and the Trip still has them afterwards
- `// @covers REQ-TRV-047@v1` — an AI suggestion is returned unsaved and counts toward the limit
- `// @covers REQ-TRV-047@v1` — at 20 generations today the suggestion is refused with the reset time
- `// @covers REQ-TRV-102@v1` — an AI error while regenerating leaves the saved Plan as it was
- `// @covers REQ-TRV-094@v1` — a Trip whose Destination was disabled regenerates and still shows its Destination
- a Day or whole-Plan regeneration counts toward the same daily limit as the first generation (supplementary)

### `tests/unit/trip-change-service.test.ts` (A)
- `// @covers REQ-TRV-098@v1` — changing the Destination returns a warning and changes nothing until confirmed
- `// @covers REQ-TRV-098@v1` — confirming sends the double a request for Kyoto and saves Kyoto with the returned Plan
- `// @covers REQ-TRV-098@v1` — if the AI fails on confirm, the Trip and Plan are unchanged and the fallback is reported (item 3)
- `// @covers REQ-TRV-098@v1` — shortening to 5 Days warns that Days 6 to 8 will be dropped, and saves nothing until confirmed
- `// @covers REQ-TRV-098@v1` — confirming leaves 5 Days with the former Days 1 to 5
- `// @covers REQ-TRV-098@v1` — lengthening to 10 Days needs no warning, keeps Days 1 to 8 and adds two empty Days
- `// @covers REQ-TRV-098@v1` — moving the dates keeps the Activities on the same numbered Days
- `// @covers REQ-TRV-098@v1` — changing adults or budget leaves the Plan unchanged and reports that the Trip has moved on from the Plan
- a change to the Trip name only touches no Plan (supplementary)
- a Trip with no Plan changes freely, with no warning (supplementary)

### `tests/api/plan-editing.http.spec.ts` (C)
- `// @covers REQ-TRV-045@v1` — PATCH an Activity's time to 11:00; reopening shows 11:00
- `// @covers REQ-TRV-046@v1` — DELETE an Activity; reopening does not show it
- `// @covers REQ-TRV-048@v1` — move an Activity from Day 2 to Day 5; Day 5 shows it, Day 2 does not, in start-time order
- `// @covers REQ-TRV-047@v1` — replace with a typed Activity; ask the AI for a suggestion and accept it
- `// @covers REQ-TRV-047@v1` — at 20 generations the suggestion gives 429 with the reset time, and a typed replacement still gives 200
- `// @covers REQ-TRV-103@v1` — with the AI never answering, edit, remove and move all succeed and persist
- an Activity that is absent, on a deleted Trip, or someone else's gives the same 404; not logged in gives 401 (supplementary)

### `tests/api/plan-regeneration.http.spec.ts` (C)
- `// @covers REQ-TRV-041@v1` — regenerating returns the double's Plan and keeps the old one restorable
- `// @covers REQ-TRV-041@v1` — with a hand edit, 409 EDITS_WOULD_BE_REPLACED and the double is not called; with `confirmReplaceEdits`, 201
- `// @covers REQ-TRV-041@v1` — at the daily limit, 429 with the reset time
- `// @covers REQ-TRV-042@v1` — regenerating Day 4 leaves the other Days identical; a hand edit on Day 4 needs confirmation
- `// @covers REQ-TRV-043@v1` — the request contains Adventure and Nature; the Trip keeps them
- `// @covers REQ-TRV-094@v1` — a Trip whose Destination is disabled regenerates and still returns Kyoto
- `// @covers REQ-TRV-102@v1` — with an AI error, 503 and the saved Plan is still the current one

### `tests/api/trip-plan-change.http.spec.ts` (C)
- `// @covers REQ-TRV-098@v1` — PATCH the Destination: 409 PLAN_CHANGE_NEEDS_CONFIRMATION, Trip and Plan unchanged; with `confirmPlanChange`, the double receives Kyoto and the Plan returned is shown
- `// @covers REQ-TRV-098@v1` — PATCH an end date that drops Days 6 to 8: 409 naming the Days; confirmed, 5 Days remain
- `// @covers REQ-TRV-098@v1` — lengthening to 10 Days saves at once and leaves two empty Days
- `// @covers REQ-TRV-098@v1` — moving the dates re-dates the Plan
- `// @covers REQ-TRV-098@v1` — changing adults or budget leaves the Plan unchanged and the Trip reports it has moved on

### `e2e/edit-regenerate.spec.ts` (B)
- `// @covers REQ-TRV-045@v1` — a Traveler edits an Activity from 10:00 to 11:00 and sees it at 11:00 after reopening
- `// @covers REQ-TRV-046@v1` — a Traveler removes an Activity and it is gone
- `// @covers REQ-TRV-048@v1` — a Traveler moves an Activity to another Day, and a Day of five holds six in time order
- `// @covers REQ-TRV-047@v1` — a Traveler replaces an Activity by typing their own, and by asking the AI for one and accepting it
- `// @covers REQ-TRV-047@v1` — at the daily limit the AI suggestion shows the reset time and typing still works
- `// @covers REQ-TRV-041@v1` — regenerating a Plan with a hand edit shows the warning first; cancelling changes nothing; confirming replaces the Plan; the old version is restorable
- `// @covers REQ-TRV-042@v1` — the Plan offers Regenerate Plan and Regenerate Day N for each Day, and nothing on an Activity
- `// @covers REQ-TRV-042@v1` — regenerating one Day leaves the others as they were
- `// @covers REQ-TRV-102@v1` — with the AI failing, regenerating shows the unavailable message and the saved Plan stays on screen
- `// @covers REQ-TRV-103@v1` — with the AI not answering, edit, remove and move all persist after reopening
- `// @covers REQ-TRV-094@v1` — after an Administrator disables the Destination, the owner regenerates and still sees the Destination
- `// @covers REQ-TRV-098@v1` — changing the Destination shows the warning, changes nothing until confirmed, then shows the new Plan
- `// @covers REQ-TRV-098@v1` — shortening the Trip warns which Days will be dropped; lengthening adds empty Days with an offer to generate each
- `// @covers REQ-TRV-098@v1` — changing the budget leaves the Plan and shows the banner
- `// @covers REQ-TRV-043@v1` — is covered in belts A and C only (its requirement lists no browser belt)

### Existing tests that must stay green
Every browser test from slices 4 to 6 after the `generatePlan` helper is updated (item 4).

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend all three.

1. **Activities carry ids, filled in as they are read for older versions.** Without them, edits address a position that moves.
2. **A Trip change and its Plan change commit together,** and a change that needs the AI asks the AI first. A Trip is never left disagreeing with its own Plan.
3. **One `409` then confirm-and-resend pattern** for every warned action. The server enforces the warning, so it cannot be skipped by calling the API directly.

## What I am unsure about

- **Version churn.** ANSWERS.md says every saved manual edit makes a version and only the last ten are kept. Ten small edits therefore push the original generated Plan out of the list, and it can no longer be restored. That is what the client said; I would raise it with them rather than change it.
- **Removal is invisible to the warnings** (item 2).
- **Day regeneration can repeat an Activity** from another Day, because the request does not list them. Listing them would put Traveler-typed titles into the request; that needs the same escaping as the accommodation text and is a small extra. I left it out.
- **Currency changes.** REQ-TRV-098 names Destination, dates, travelers and budget. Changing the currency leaves the Plan's costs in the old currency and shows no banner. The requirements do not say.
- **A Trip change that both changes the Destination and the dates** is treated as a Destination change: the Plan is regenerated for the new Destination and dates.
- **Editing a Plan whose Trip's dates have already passed** is allowed. Nothing says otherwise.
- **Empty Days** are stored as Days with no Activities. REQ-TRV-026 requires every Day of a *generated* Plan to hold one, so the empty ones only come from lengthening a Trip. The Plan reader must accept them; the AI-reply reader must keep refusing them.
- **AI-suggested replacements are trusted by the client.** Accepting one sends it back as a replace request, so a Traveler could label their own text as an AI suggestion and avoid the "changed by hand" mark. That only affects the warning, not safety.
- **Free text again.** Typed Activity fields are Traveler text. They are shown as text and are not sent to the AI in this slice, so there is no injection path here. If Day regeneration later lists them, they must be escaped.
- **Size.** This is about 40 criteria and roughly a third larger than slice 5. If you would rather build it as two slices (edits and moves first; regeneration and Trip changes second), REQ-TRV-045, 046, 047, 048 and 103 stand alone. That is a change to the sequence, so it would need `/change-record`; I have not assumed it.

## Review triggers

Free text stored and returned, new owner-only routes, AI calls and a server-enforced confirmation
all match the security review list. Run **security-reviewer** before the commit, and
**typescript-reviewer** and **code-reviewer** after `/tdd`.

## Then

Waiting for you. Answer the four items at the top, or say "I approve" to take my
recommendations, then run `/tdd REQ-TRV-041 REQ-TRV-042 REQ-TRV-043 REQ-TRV-045 REQ-TRV-046 REQ-TRV-047 REQ-TRV-048 REQ-TRV-094 REQ-TRV-098 REQ-TRV-102 REQ-TRV-103`.
