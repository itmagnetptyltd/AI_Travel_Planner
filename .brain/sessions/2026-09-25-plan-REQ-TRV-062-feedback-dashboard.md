# Plan — Slice 12 Feedback and admin dashboard

Covers REQ-TRV-062@v1, 063@v1, 064@v1, 065@v1, 069@v1, 070@v1, 079@v1, 100@v1 and 101@v1. All `agreed`, v1.
Priorities: 100 and 101 `must`; 062, 063, 064, 065, 069, 070 `should`; 079 `wont` (kept as a future enhancement, so its
two criteria only say the build has exactly two roles). Branch `feat/trv-feedback-dashboard`. Gate: slice 11 is Done
(9/9), so this slice may start. Dependencies 026, 099, 007, 017, 068 and 071 are verified; the rest are inside this slice.

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded governs this plan and no rejected
approach is being re-proposed.

ANSWERS.md settles the shape: feedback may be given once a Plan exists, one entry per Trip, the Traveler may edit it and
the latest replaces the earlier; 1 to 5 stars, required, with an optional comment of up to 1,000 characters; an
Administrator reviews feedback by filtering (rating, Destination, date range, keyword), sorting and exporting to CSV, with
no theme tagging; an Administrator sees a Trip's summary only, and may open the full Plan only for a Trip that has feedback,
each such view audit-logged; feedback on a permanently deleted Trip is kept as rating, comment, Destination and date, with no
link to the Traveler or the Trip; all seven dashboard metrics are required, AI usage as requests and estimated cost over a
selectable date range.

**Status: proposal. Nothing is built. Seven items under "Needs your decision" should be answered before `/tdd`.**

---

## Needs your decision before /tdd

### 1. What "generated itineraries" counts

REQ-TRV-069 says one Trip generated once and regenerated twice, then changed by a chat change and a restore, is 3. ANSWERS.md
says "count of Plan versions created by generation/regeneration". Counting Plan versions has two flaws: a Trip keeps only its
latest 10 versions, and a Trip's versions go when it is permanently deleted, so the count would fall for no reason. I
recommend counting **successful whole-Plan generations in the AI request record** instead, which survives both, gives 3 for
that example, and includes the regeneration made when a Trip's Destination changes. A single-Day regeneration would **not**
count. If the client means Day regenerations too, say so.

### 2. Where the Trips view and the metrics live

REQ-TRV-068 fixes the admin dashboard's functions at five (Users, Destinations, Feedback, Notification settings, AI usage
limits), and a test pins them. I propose **no sixth function**: the metrics appear on the dashboard page itself; the Trips
view is reached from the Users function, the way stored AI requests are reached from the AI usage limits page; and Feedback,
which today reads "Not available yet", becomes a working link.

### 3. Which date a feedback entry carries

One entry per Trip that the Traveler can edit, the latest replacing the earlier. I propose its **date is when it was last
saved**, and so are the Plan version it records (REQ-TRV-062: "current Plan version is 3" means the version current at
saving). The alternative keeps the first date. The date is what the Administrator's date-range filter and the CSV use.

### 4. May feedback be given after the Trip has ended?

REQ-TRV-062's first example says "whose end date has not passed"; ANSWERS.md says "once a Plan is generated" and "edit at any
time". I propose feedback is accepted **whatever the dates**, since nothing refuses it, and the example only describes one
case. Say if a Trip that has ended should be refused.

### 5. What the counts include

- **Total users:** every Traveler account, confirmed or not, enabled or not; Administrators are not counted.
- **Total trips, the Draft/Planned split, popular destinations, average budget:** Trips that are not deleted (a Trip in the 30-day
  restore window is gone to everyone but its owner, so it is not counted or listed).
- **AI usage:** every recorded request in the date range, whatever its outcome, with its estimated cost in US dollars.
- **Average budget:** rounded to a whole unit of its currency; **average rating:** one decimal (4.0).
- **No date range chosen:** all time. The range applies to AI usage only, as the example says.

### 6. A permanently deleted Trip's feedback: how it survives

I propose the feedback row keeps a **copy of the Destination name and country** and its Trip link is cleared (not deleted) when
the Trip is purged. It never holds an account, so after the purge nothing links it to the Traveler. Until then, the
Administrator's feedback list shows the Trip's name; afterwards, "no longer available". The browser test for this needs the
purge to run more often than hourly, so I would add a setting `TRIP_PURGE_INTERVAL_MS` (default one hour), as the reminder has.

### 7. The Administrator's view of a Trip's Plan

I propose: an Administrator asking for a Plan of a Trip **without** feedback gets 403, and with feedback gets the Plan, read-only,
as the link view shows it (no ids, no chat), and an audit entry `trip-plan.viewed` naming the Administrator and the Trip is
written **before** the Plan is returned, so a view cannot happen unrecorded. The Administrator's Trips list shows the owner's
email address, as REQ-TRV-070 asks for the owner.

---

## What must be true

### REQ-TRV-062 — a Traveler rates a Plan (A B C)
1. A Traveler submits rating 4 and "Day 2 too busy" on a Trip with a Plan; it is accepted and a confirmation shown.
2. A Draft Trip with no Plan refuses feedback and stores none.
3. Rating 2 then rating 5 leaves one entry, rated 5.
4. Rating 0 or 6 is refused, naming the rating; a comment with no rating is refused, naming the rating.
5. A 1,001-character comment is refused, naming the comment; 1,000 characters, and no comment, are accepted.
6. The stored feedback records the current Plan version (3 when the Plan is at 3).

### REQ-TRV-063 — stored against the Trip (A C)
1. Read back, it identifies "Tokyo Family Holiday" as its Trip.
2. Given while Plan version 2 was current, then the Plan is regenerated to 3: it still identifies version 2.
3. After the Trip is deleted and permanently deleted, an Administrator reads it with rating, comment, Destination and date, and no Traveler or Trip.

### REQ-TRV-064 — the Administrator lists all feedback (A B C)
1. With two Travelers' feedback, the list shows both, each with rating, comment and Trip.

### REQ-TRV-065 — finding what recurs (A B C)
1. Keyword "busy": exactly the three entries whose comments contain it.
2. Rating 2: only the entry rated 2.
3. Destination Tokyo: only the Tokyo feedback.
4. Date range 2026-09-15 to 2026-10-15: only the entry of 2026-10-01.
5. Sorted by rating, lowest first: 2, 4, 5.
6. Exporting a list filtered to two entries gives a CSV of exactly those two, each with rating, comment, Destination and date.
7. No option to tag feedback with a theme is offered.

### REQ-TRV-069 — the dashboard's metrics (A B C)
1. 3 Travelers and 5 Trips: total users 3, total trips 5, split as 2 Draft and 3 Planned.
2. 4 feedback entries rated 5, 4, 3 and 4: feedback volume 4, average rating 4.0.
3. One Plan generated once and regenerated twice, then a chat change and a restore: generated itineraries 3.
4. Trips to 12 Destinations: popular destinations lists 10, ordered by number of Trips.
5. Budgets of 4000 USD, 6000 USD and 3000 AUD: average budget 5000 USD and 3000 AUD, no combined figure.
6. 10 AI requests costing 1.50 inside a date range and 5 outside it: choosing that range shows 10 requests and 1.50.

### REQ-TRV-070 — the Administrator sees every Trip (A B C)
1. Two Travelers' Trips are both listed with their owner.
2. A Trip with a Plan is listed with Destination, dates, number of travelers, budget, status and feedback, and no Days or Activities.
3. Opening the full Plan of a Trip without feedback is refused, and no Days or Activities are shown.
4. Opening the Plan of a Trip with feedback shows it, and an audit entry records the Administrator and the Trip.

### REQ-TRV-101 — the summary and not the Plan (A B C)
1. The Administrator's request for a Traveler's Trip carries Destination, dates, number of travelers, budget and status, and no Days or Activities.

### REQ-TRV-100 — feedback outlives the Trip (A B C)
1. Feedback rated 4, "Day 2 too busy", on a Trip to Tokyo that is permanently deleted after 30 days remains with that rating, comment, Destination Tokyo and its date, and with no link to the Traveler or the Trip.

### REQ-TRV-079 — two roles only (A B C)
1. The roles an account can hold are exactly Traveler and Administrator.
2. Assigning Travel Consultant is refused and the user's role is unchanged.

---

## Approach

**Feedback.** New table `feedback` (migration 0008): its own id; `trip_id`, unique and nullable, a foreign key to `trips` that is
**set to null** when the Trip is purged; `plan_version`; `rating` (1 to 5, also a CHECK); `comment` (null when blank); the
Destination's name and country as they were when saved; `created_at` and `updated_at` (the date shown and filtered is
`updated_at`, see item 3). There is deliberately **no account column**: the Traveler is reached only through the Trip, so once
the Trip is gone nothing links the two. The Traveler's routes are `PUT /api/trips/:id/feedback` (create or replace, one per Trip)
and `GET /api/trips/:id/feedback`, both owner-only with the usual 404 for a Trip that is absent, deleted or someone else's. A
Trip with no saved Plan gets `PLAN_NOT_FOUND`. The body is strict, the rating an integer 1 to 5, the comment up to 1,000
characters counted as characters, a blank one stored as none.

**Administrator.** All under `/api/admin`, so the existing guard covers them:
- `GET /api/admin/feedback` with `keyword`, `rating`, `destination`, `from`, `to`, `sort` (rating or date) and `order`; and
  `GET /api/admin/feedback/export` with the same filters, returning `text/csv` with rating, comment, Destination and date only
  (no Trip, no Traveler). A leading `=`, `+`, `-`, `@`, tab or carriage return in a cell is neutralised so a comment cannot become
  a spreadsheet formula. The keyword is a plain, case-insensitive substring; `%` and `_` in it match themselves.
- `GET /api/admin/trips`, `GET /api/admin/trips/:id` (summary) and `GET /api/admin/trips/:id/plan` (gated as in item 7, audited).
  The list carries the owner's email address, never a Day or an Activity.
- `GET /api/admin/metrics?from=&to=` with the figures of item 5.
- `GET /api/admin/roles`, listing exactly the roles; a role the server does not know is refused as it already is, and this is
  now pinned by tests.

**Web.** A "Rate this Plan" section on the Trip page (1 to 5 as a radio group, a comment box, Save, the saved entry shown and
editable, a confirmation announced politely). Admin pages: Feedback (filters, sort, table, Export CSV, no tagging control),
Trips (list, and a Trip's summary with "Open full Plan" only when it has feedback), and the metrics on the dashboard with a
date range for AI usage. The Plan an Administrator opens is drawn by the same read-only component the shared link uses, which
I would extract from `SharedPlanPage.tsx` so the two cannot drift.

**Files (new):** `src/shared/feedback-schemas.ts`, `src/shared/admin-metrics.ts`,
`src/server/feedback/{feedback-store,feedback-service,feedback-routes,feedback-csv}.ts`,
`src/server/admin/{admin-trip-service,metrics-service}.ts`, migration `0008`,
`src/web/components/{FeedbackPanel,use-feedback,feedback-view-state,ReadOnlyPlan}.tsx`,
`src/web/pages/admin/{AdminFeedbackPage,AdminTripsPage,AdminTripPage,admin-feedback-state}.tsx`, and the tests below.
**Files (changed):** `src/server/db/schema.ts`, `src/server/admin/{admin-routes,audit-log}.ts`, `src/server/app.ts`,
`src/server/config.ts`, `src/server/main.ts`, `src/shared/admin-functions.ts`, `src/web/App.tsx`,
`src/web/pages/{TripPage,SharedPlanPage}.tsx`, `src/web/pages/admin/{AdminDashboardPage,AdminUsersPage}.tsx`,
`src/web/components/TripPage` wiring, `README.md`, `.env.example`, `playwright.config.ts`.

**Build order:** feedback (062, 063), the Administrator's feedback list and filters (064, 065), permanent deletion (100), the
Trips view and the Plan gate (070, 101), the metrics (069), roles (079), then the pages.

---

## Test skeleton

Belts: A = `tests/unit`, C = `tests/api/*.http.spec.ts`, B = `e2e/`.

### A — `tests/unit/feedback-schemas.test.ts`, `feedback-service.test.ts`
- `@covers REQ-TRV-062@v1` — rating 4 with "Day 2 too busy" is accepted; no comment is accepted
- `@covers REQ-TRV-062@v1` — rating 0, rating 6, rating 3.5 and a missing rating are each refused naming `rating`
- `@covers REQ-TRV-062@v1` — a comment with no rating is refused naming `rating`
- `@covers REQ-TRV-062@v1` — a 1,001-character comment is refused naming `comment`; 1,000 characters, and a blank comment, are accepted
- `@covers REQ-TRV-062@v1` — a Trip with no Plan refuses feedback and stores none
- `@covers REQ-TRV-062@v1` — rating 2 then rating 5 leaves one entry rated 5
- `@covers REQ-TRV-062@v1` — the entry records the Plan version current when it was saved (3)
- `@covers REQ-TRV-062@v1` — feedback is accepted for a Trip whose end date has passed
- `@covers REQ-TRV-063@v1` — the entry identifies the Trip by its name
- `@covers REQ-TRV-063@v1` — feedback given at version 2 still says 2 after the Plan is regenerated to 3, and says 3 once the Traveler edits it
- `@covers REQ-TRV-063@v1` — the entry holds the Destination as it was, whatever happens to the Destination afterwards

### A — `tests/unit/feedback-admin.test.ts`, `feedback-csv.test.ts`
- `@covers REQ-TRV-064@v1` — two Travelers' entries are both listed with rating, comment and Trip
- `@covers REQ-TRV-065@v1` — keyword "busy" lists exactly the three that contain it, whatever the case, and `%` `_` match themselves
- `@covers REQ-TRV-065@v1` — rating 2 lists only the entry rated 2; Destination Tokyo lists only Tokyo
- `@covers REQ-TRV-065@v1` — the range 2026-09-15 to 2026-10-15 lists only 2026-10-01, and includes both end dates
- `@covers REQ-TRV-065@v1` — sorted by rating, lowest first, lists 2, 4, 5; highest first and by date work too
- `@covers REQ-TRV-065@v1` — the CSV of a list filtered to two entries holds exactly those two, with rating, comment, Destination and date and nothing else
- `@covers REQ-TRV-065@v1` — a comment with a comma, a quote or a line break is quoted correctly; one starting `=` `+` `-` `@` is neutralised
- `@covers REQ-TRV-065@v1` — the actions offered for feedback have no theme tagging

### A — `tests/unit/permanent-delete-feedback.test.ts`
- `@covers REQ-TRV-100@v1` — feedback on a Trip permanently deleted after 30 days keeps rating 4, "Day 2 too busy", Destination Tokyo and its date
- `@covers REQ-TRV-100@v1` — after the purge it holds no Trip and no account: no column of the row leads to either
- `@covers REQ-TRV-100@v1` — feedback on a Trip that is only soft-deleted is still linked to it
- `@covers REQ-TRV-063@v1` — an Administrator reads the purged feedback with no Traveler or Trip identified

### A — `tests/unit/admin-metrics.test.ts`, `admin-trip-service.test.ts`, `admin-roles.test.ts`
- `@covers REQ-TRV-069@v1` — 3 Travelers and 5 Trips give users 3, trips 5, split 2 Draft and 3 Planned; Administrators and deleted Trips are not counted
- `@covers REQ-TRV-069@v1` — feedback of 5, 4, 3, 4 gives volume 4 and average 4.0
- `@covers REQ-TRV-069@v1` — one Plan generated, regenerated twice, then a chat change and a restore, gives generated itineraries 3; a failed generation and a Day regeneration are not counted
- `@covers REQ-TRV-069@v1` — 12 Destinations give the 10 with most Trips, in order, ties in a fixed order
- `@covers REQ-TRV-069@v1` — budgets 4000 USD, 6000 USD, 3000 AUD give 5000 USD and 3000 AUD and no combined figure
- `@covers REQ-TRV-069@v1` — 10 requests costing 1.50 inside the range and 5 outside give 10 and 1.50; the range includes both end dates
- `@covers REQ-TRV-069@v1` — an empty application shows every figure as zero, never an error
- `@covers REQ-TRV-070@v1` — two Travelers' Trips are both listed with their owner
- `@covers REQ-TRV-070@v1` — a Trip is listed with Destination, dates, travelers, budget, status and feedback, and with no Days or Activities
- `@covers REQ-TRV-070@v1` — the Plan of a Trip with no feedback is refused; with feedback it is returned and one audit entry names the Administrator and the Trip
- `@covers REQ-TRV-070@v1` — no Plan is returned if the audit entry could not be written
- `@covers REQ-TRV-101@v1` — the summary of a Traveler's Trip carries Destination, dates, travelers, budget and status and no Days or Activities
- `@covers REQ-TRV-079@v1` — the roles are exactly Traveler and Administrator
- `@covers REQ-TRV-079@v1` — Travel Consultant is refused as a role and nothing changes

### A — web view-state
- `@covers REQ-TRV-062@v1`, `REQ-TRV-064@v1`, `REQ-TRV-065@v1`, `REQ-TRV-069@v1` — the words for the saved-feedback confirmation, the star label, the filter summary, the metrics figures (4.0, 1.50, "no combined figure") and the Trips view's "no feedback: Plan not available"

### C — `tests/api/feedback.http.spec.ts`
- `@covers REQ-TRV-062@v1` — PUT rating 4 and a comment answers 200 and reading it back shows both
- `@covers REQ-TRV-062@v1` — a Draft Trip answers 404 `PLAN_NOT_FOUND` and stores none; rating 0 and 6, and a comment alone, answer 400 field `rating`; 1,001 characters answers 400 field `comment`; 1,000 and none answer 200
- `@covers REQ-TRV-062@v1` — rating 2 then 5 leaves one entry rated 5; version 3 is recorded
- `@covers REQ-TRV-063@v1` — read back it names "Tokyo Family Holiday"; after the Plan is regenerated it still says version 2
- `@covers REQ-TRV-062@v1` — 401 without a login; another Traveler's Trip is the same 404 as a Trip that does not exist; nothing else can be put in the body
- `@covers REQ-TRV-100@v1` — after the Trip is deleted and purged (clock moved 31 days), the Administrator's list still shows rating 4, "Day 2 too busy", Tokyo and its date, with no Trip and no Traveler
- `@covers REQ-TRV-063@v1` — the Traveler's own read of a purged Trip is the usual 404

### C — `tests/api/admin-feedback.http.spec.ts`
- `@covers REQ-TRV-064@v1` — two Travelers' feedback is listed with rating, comment and Trip
- `@covers REQ-TRV-065@v1` — filters by keyword, rating, Destination and date range; sort by rating; export returns `text/csv` with exactly the filtered entries, four columns, and a formula neutralised
- `@covers REQ-TRV-065@v1` — no route offers to tag feedback; a Traveler gets 403 on every route
- `@covers REQ-TRV-065@v1` — a bad `sort`, `rating` or date is a 400 naming the field

### C — `tests/api/admin-trips.http.spec.ts`, `admin-metrics.http.spec.ts`, `admin-roles.http.spec.ts`
- `@covers REQ-TRV-070@v1` — both Travelers' Trips are listed with their owner, with the summary fields and no Days or Activities
- `@covers REQ-TRV-101@v1` — GET a Traveler's Trip as the Administrator carries the summary and no `days`, `activities` or `plan`
- `@covers REQ-TRV-070@v1` — the Plan of a Trip with no feedback is 403 and shows nothing; with feedback it is 200 and the audit log holds one entry
- `@covers REQ-TRV-069@v1` — the metrics for 3 Travelers, 5 Trips (2 Draft, 3 Planned), 4 feedback entries, the three-generation Trip, 12 Destinations, three currencies, and AI requests inside and outside a range
- `@covers REQ-TRV-079@v1` — GET roles lists exactly Traveler and Administrator; PUT the role Travel Consultant answers 400 and the role is unchanged
- every route is guarded: the existing test that proves each admin route refuses a Traveler covers the new ones

### B — `e2e/feedback.spec.ts`, `e2e/admin-feedback.spec.ts`, `e2e/admin-dashboard.spec.ts`
- `@covers REQ-TRV-062@v1` — a Traveler rates a Plan 4 with a comment, sees the confirmation, reloads and sees it, changes it to 5, and a Trip with no Plan offers no form
- `@covers REQ-TRV-064@v1`, `REQ-TRV-065@v1` — an Administrator lists two Travelers' feedback, filters by keyword, rating and Destination, sorts by rating, exports CSV and finds no tagging control
- `@covers REQ-TRV-100@v1` — a Trip with feedback is deleted, purged (seeded 31 days ago, purge interval short) and its feedback is still listed with rating, comment, Destination and date and no Trip
- `@covers REQ-TRV-069@v1` — the dashboard's figures move by exactly the amount of what the test creates (a Traveler, a Trip, feedback), and AI usage follows the date range
- `@covers REQ-TRV-070@v1`, `REQ-TRV-101@v1` — the Trips view lists a Trip with its owner and no Days; the full Plan is refused for a Trip without feedback and shown for one with
- `@covers REQ-TRV-079@v1` — the Users page shows exactly Traveler and Administrator, and asking for Travel Consultant is refused with the role unchanged

### Existing tests that must stay green
Every test in slices 1 to 11. Watch: the admin dashboard/functions tests (Feedback stops being "Not available yet"), the admin route
guard test (new routes), config tests (a new setting), the Trip purge tests, and every e2e that counts headings or roles on the Trip page.

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend all.

1. **Feedback holds no account**, so anonymity after a purge is by construction.
2. **"Generated itineraries" is counted from successful whole-Plan generations in the AI request record.**
3. **An Administrator's view of a Plan is written to the audit log before it is returned**, and only for a Trip with feedback.
4. **A CSV export neutralises spreadsheet formulas.**
5. **The Trips view is reached from Users and the metrics sit on the dashboard**: no sixth admin function.

## What I am unsure about

- **A Traveler deleting their account.** ANSWERS.md says their feedback is anonymised, but no requirement builds account deletion, so it is
  not in this slice. Because feedback holds no account, it would need nothing more than the Trips going.
- **A soft-deleted Trip's feedback** stays in the Administrator's list, named by its Trip, until the purge. No criterion says.
- **Comments can hold personal details** (a name, a hotel). The Administrator reads them. Nothing in the requirements redacts them.
- **A comment's length** is counted in characters as JavaScript counts them, so some emoji count as two. "1,000 characters" is met for ordinary text.
- **"Popular destinations"** counts Trips, not distinct Travelers, so one Traveler with five Trips to Kyoto makes Kyoto five.
- **REQ-TRV-079** is priority `wont` yet in this slice. Its two criteria are cheap and worth pinning, and I build only those.
- **The audit log** has no screen; entries are read from the database. A screen would be a new requirement.
- **Dates and time zones.** Every date here (feedback date, filter range, metrics range) is the UTC calendar date, the same as the AI limits.

## Review triggers

Blocking under the project's own rules: an Administrator's access to Travelers' data, an audit trail, a CSV export of user text,
a `LIKE`-style filter on user text, privacy (feedback surviving without a link), and a new migration with a foreign key. I would
run **security-reviewer** (twice: after the admin Plan gate and the CSV, and at the end), **typescript-reviewer**, **react-reviewer**
and **database-reviewer**.

## Then

Waiting for you. Answer the seven items at the top, or say "I approve" to take my recommendations, then run
`/tdd REQ-TRV-062 REQ-TRV-063 REQ-TRV-064 REQ-TRV-065 REQ-TRV-069 REQ-TRV-070 REQ-TRV-079 REQ-TRV-100 REQ-TRV-101`. You are already on
`feat/trv-feedback-dashboard`.
