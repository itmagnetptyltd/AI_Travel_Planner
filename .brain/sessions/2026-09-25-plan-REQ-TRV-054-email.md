# Plan — Slice 11 Email

Covers REQ-TRV-054@v1, 032@v1, 055@v1, 056@v1, 057@v1, 058@v1, 059@v1, 060@v1 and 092@v1. All `agreed`, v1, priority `must`
(except 092, `should`). Branch `feat/trv-email`. Gate: slice 10 is Done (5/5), so this slice may start.
Dependencies REQ-TRV-026, 011, 017, 037 and 071 are verified; the rest are inside this slice.

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded governs this plan and no rejected
approach is being re-proposed. ADR-0005 ("email goes only through `EmailService`") is referred to in the code but was never
written; this slice keeps to it.

ANSWERS.md already settles most of the shape: the email carries a readable summary of the whole Plan (Days, Activities, total
estimate) plus a link to a read-only view; the link is an unguessable token, needs no login, expires after 30 days and can be
revoked; shares are limited to 10 recipients per Trip per day and name the sharer; the Plan email is sent only on request; "Trip
Created" is separate and short; "Itinerary Updated" is for dates, Destination and whole-Plan regeneration, at most once an hour per
Trip; one reminder, 3 days before, at 09:00 in the configured timezone, recorded so it is never sent twice, and none for a Trip
created less than 3 days out; each Traveler can switch the three notification events off for themselves and an Administrator can
for everyone; account emails and shares cannot be switched off; development mail goes to a test inbox, never a transactional
service.

**Status: proposal. Nothing is built. Seven items under "Needs your decision" should be answered before `/tdd`. This is the largest
slice so far: nine requirements, a public unauthenticated page, an emailed token, and a background job.**

---

## Needs your decision before /tdd

### 1. Should this slice be split in two? (I recommend yes)

It is one branch and one pull request as `slices.yaml` stands. A reviewer would have to read a public share link, tokens, five email
kinds, two settings screens and a scheduler at once. I suggest two slices:

- **11a "Plan email and sharing"**: REQ-TRV-054, 032, 058, 059 (the Plan email, the read-only view, shares, revocation).
- **11b "Notifications"**: REQ-TRV-055, 056, 057, 060, 092 (Trip Created, Itinerary Updated, reminders, switches).

Splitting is a change to `.brain/slices.yaml` (`/slice-add`), which is yours to decide. **If you say "I approve" I will build the
whole slice on this branch, in that order, and it will be one pull request.**

### 2. Which timezone?

REQ-TRV-057 says "the application's configured timezone" and nothing says which. I would add a required setting `APP_TIMEZONE`
(an IANA name such as `Australia/Sydney`) and refuse to start without it, so it is chosen deliberately per environment. I have
**not** picked a value: `.env.example` would show `Australia/Sydney` as an example only. The client should say what production uses.

### 3. Where the sender address is stated

REQ-TRV-054 says the captured email is "sent from no-reply@itmagnet.com.au". Today `EmailMessage` has no sender; the SMTP
transport adds `EMAIL_FROM` itself, so a test cannot see it. I propose `EmailMessage` gains a `from`, filled from `EMAIL_FROM` by
one place, and the SMTP and file transports use it. The address itself stays a setting: `no-reply@itmagnet.com.au` in production,
whatever the test sets in tests.

### 4. What makes a configuration "development"

The last criterion of REQ-TRV-054 needs the application to know it is in development. Nothing does. I propose a required setting
`APP_ENV` (`development` or `production`) and one rule at startup: in `development` the mail transport must be `file`, or `smtp`
to `127.0.0.1` or `localhost` (Mailpit); anything else refuses to start. That is testable, and it is what makes "not handed to the
transactional service" true rather than hoped for. Existing `.env` files would need the new line.

### 5. The Plan email's link is a share link of its own

The link in an "Email me this Plan" email is a read-only-view token like any other, for the Traveler's own address. I propose it
is listed with the Trip's other links, can be revoked the same way, expires after 30 days, and **does not count** towards the 10
recipients a day, because it goes to the Traveler, not to another person. Say if it should count.

### 6. What a share names when the sharer has no display name

Sharing "names Jane Citizen as the sharer". A Traveler is not required to have a display name. I propose the email says the
display name when there is one and otherwise the sharer's **email address**, since a recipient has to be able to tell who sent it.
The alternative is "a Traveler", which tells the recipient nothing. This puts an email address in another person's inbox, so it is
yours to decide.

### 7. When "today" begins for the 10-recipient limit

The AI limits use the UTC calendar day. With a timezone now configured, "today" could be that day instead. I recommend the **UTC
day**, for consistency with the AI limits and so a Traveler's limit does not move if the timezone setting changes. Say if the
client means the local day.

---

## What must be true

### REQ-TRV-054 — the Plan by email, on request (A B C)
1. Clicking "Email me this Plan" sends one email to the account address, from the configured sender.
2. It lists all Days with their Activities and the total estimate (3200 USD for the example Plan), with a link to a read-only view.
3. Generating or regenerating a Plan sends no email carrying it.
4. In development the email goes to the test inbox and never to the transactional service.

### REQ-TRV-032 — labelled as recommendations (A C)
1. The email body says the Plan is a recommendation, not guaranteed availability, prices or bookings (the same words as the Plan screen).
2. The read-only view says the same.

### REQ-TRV-055 — "Trip Created" (A C)
1. Creating a Trip sends one short email to the Traveler with the Trip name, Destination, dates and a link to open it, and no Plan content.
2. Editing the Trip sends no further one.
3. A Traveler who switched it off gets none.
4. An Administrator having switched it off for everyone means none, even for a Traveler who has it on.

### REQ-TRV-056 — "Itinerary Updated" (A C)
1. Changing the dates of a Trip that has a Plan sends one, naming the Trip.
2. Changing the Destination (the Plan is regenerated) sends one.
3. Regenerating the whole Plan sends one.
4. Regenerating a single Day, editing an Activity or accepting a chat change sends none.
5. A second within 20 minutes sends none; one after 61 minutes sends one.
6. A Traveler who switched it off gets none.

### REQ-TRV-057 — "Trip Reminder" (A C)
1. The reminder check at 09:00 on 2026-10-07 (configured timezone) for a Trip starting 2026-10-10 sends one, naming the Trip.
2. Once sent and recorded, a later check sends no more.
3. At 08:59 it sends none.
4. A Trip created on 2026-10-08 for 2026-10-10 never gets one.
5. A Traveler who switched it off gets none.
6. It is sent by the running application with nobody logged in, and its link uses the public HTTPS address.

### REQ-TRV-058 — sharing by email address (A B C)
1. Sharing a Trip that has a Plan with friend@example.com sends one "Itinerary Shared" email to that address.
2. It names the sharer, lists every Day with its Activities and the total, and links to a read-only view.
3. The link opens a read-only view with no login and no way to change anything.
4. A link 31 days old is refused as expired, and shows no Plan.
5. A revoked link is refused and shows no Plan.
6. A link with one character of its token altered is refused and shows no Plan.
7. The token does not contain the Trip's identifier.
8. An 11th recipient in a day is refused and no email is sent.

### REQ-TRV-059 — a malformed address (A B C)
1. Sharing to "friend-at-example" is refused, naming the recipient field, and no email is sent.

### REQ-TRV-060 — switches (A B C)
1. A Traveler's own switch off stops that event's email (reminder shown).
2. An Administrator's switch off for everyone stops Itinerary Updated for a Traveler who has it on.
3. A new Traveler's settings offer Trip Created, Itinerary Updated and Trip Reminder, each on.
4. No switch is offered for account confirmation, password reset or "Itinerary Shared".
5. With all three switched off, a password reset email is still sent.

### REQ-TRV-092 — a disabled Traveler (A B C)
1. A disabled Traveler whose Trip reaches its reminder point is sent no email.

---

## Approach

**Emails.** Plain text only, as the existing `EmailMessage` is: nothing a Traveler typed can become markup. One module
`src/server/email/plan-email-templates.ts` builds the five new messages (Plan, Shared, Trip Created, Itinerary Updated, Trip
Reminder) beside the two account ones. The Plan summary and total are written once and used by both the Plan and Shared emails,
and the total is the slice-10 `estimatesOf`, so the email cannot disagree with the screen. Text a Traveler typed (Trip name,
Activity titles, the sharer's name) goes through the existing one-line helper so it cannot add a header or a line of its own.

**Read-only view.** `GET /api/shared/:token` (no login) and a public page `/shared/:token`. The response has the Trip name,
Destination, dates, the Plan, the estimates and the recommendation notice; no ids, no owner, no account email. It sends
`Cache-Control: no-store` and is rate-limited. An unknown, altered, revoked or deleted-Trip link gets one identical 404; an
expired link gets 410 saying so (only someone holding a once-valid token can reach it).

**Tokens.** 32 random bytes from the system's secure generator, base64url, so the token has no relation to the Trip's id. Only a
SHA-256 hash is stored, so a copy of the database yields no working link. Lookup is by that hash; an altered token simply hashes to
something not there. Expiry is 30 days from creation.

**Data (one migration, 0007).** `plan_shares` (id, trip, token hash, recipient or null for the Traveler's own, created, expires,
revoked); `notification_log` (trip, kind, sent at) for the once-an-hour rule; three columns on `accounts` for the Traveler's
switches, all on by default; `reminder_sent_at` on `trips`. The Administrator's switches go in the existing `app_settings`.

**Who decides whether to send.** One `notification-service.ts` owns every rule: is the event switched on for the whole application
and for this Traveler, is the account confirmed and not disabled, is it within the hour. The routes call it after the change has
been saved. Sending is after the fact: a failed email is logged with a correlation id and never undoes a Trip or a Plan (the
Traveler's own "Email me this Plan" and shares are the exception, below).

**Triggers.** Trip Created after the Trip is saved. Itinerary Updated from the Trip-change route when the dates or Destination
changed and a Plan existed, and from the whole-Plan route when a Plan already existed (the very first generation is not an update).
Day regeneration, Activity edits and chat accepts never call it. A Destination change that regenerates the Plan sends one email,
not two.

**Reminders.** `runReminderCheck(now)` finds Trips that are not deleted, have no `reminder_sent_at`, belong to a confirmed,
enabled Traveler with the reminder on, whose reminder point (09:00 in `APP_TIMEZONE` on the date three days before the start) has
passed, that were created before that point, and that have not started. It claims each Trip with a conditional update before
sending, so overlapping checks cannot send twice, and releases the claim if the send fails so the next check retries. It runs
every 15 minutes from the application itself (the same mechanism as the hourly purge), so it needs nobody logged in. The link uses
`APP_BASE_URL`.

**Sharing and the Plan email** are `POST /api/trips/:id/plan/email` (to the account address) and
`POST /api/trips/:id/shares` (`{ recipient }`), with `GET /api/trips/:id/shares` and `DELETE /api/trips/:id/shares/:shareId`. A
Trip with no Plan gets the usual `PLAN_NOT_FOUND`. These two fail loudly: if the email cannot be sent, nothing is recorded, the
limit is not used, and the Traveler is told.

**Settings.** The Traveler's three switches are part of `/api/profile` (strict: any other key is refused, so no switch can exist for
an account email). The Administrator's are `GET` and `PUT /api/admin/notification-settings`, an ordinary guarded admin route, so the
test that proves every admin route is guarded covers it.

**Web.** A "Share and email" section on the Trip page (button, recipient field, list of links with Revoke); a public
`SharedPlanPage`; the switches on the Profile page; an admin page beside the AI limits page.

**Files (new):** `src/server/notifications/{notification-service,notification-settings,reminder-schedule,share-service,share-token,share-store}.ts`,
`src/server/notifications/{share-routes,notification-routes}.ts`, `src/server/email/plan-email-templates.ts`,
`src/server/email/create-email-service.ts` (moved out of `main.ts` so it can be tested), migration `0007`,
`src/shared/{notification-schemas,share-schemas}.ts`, `src/web/components/{SharePanel,use-shares,share-view-state}.ts(x)`,
`src/web/pages/{SharedPlanPage,admin/AdminNotificationsPage}.tsx`.
**Files (changed):** `src/server/config.ts`, `src/server/main.ts`, `src/server/app.ts`, `src/server/db/schema.ts`,
`src/server/email/{email-service,smtp-email-service}.ts`, `src/server/trips/trip-routes.ts`, `src/server/plans/plan-routes.ts`,
`src/server/accounts/{account-service,profile-routes}.ts`, `src/shared/profile-schemas.ts`, `src/web/App.tsx`,
`src/web/pages/{ProfilePage,TripPage}.tsx`, `.env.example`, `README.md`, `playwright.config.ts`.

**Build order** (each step green before the next): switches and the settings store (060); the email templates and the Plan email
with its read-only view (054, 032); sharing and revocation (058, 059); Trip Created and Itinerary Updated (055, 056); the reminder
and the disabled-Traveler rule (057, 092).

---

## Test skeleton

Belts: A = `tests/unit`, C = `tests/api/*.http.spec.ts`, B = `e2e/`. A captured mail service already exists
(`tests/support/capturing-email-service.ts`); the e2e server writes each email to `.e2e/outbox`.

### A — `tests/unit/plan-email-templates.test.ts`
- `@covers REQ-TRV-054@v1` — the Plan email is addressed to the account address and sent from the configured sender
- `@covers REQ-TRV-054@v1` — an 8-Day Plan's email lists all 8 Days with their Activities and the total estimate 3200 USD
- `@covers REQ-TRV-054@v1` — it contains a link to the read-only view built from the public address
- `@covers REQ-TRV-032@v1` — the Plan email and the Shared email both state the Plan is a recommendation, not guaranteed availability, prices or bookings
- `@covers REQ-TRV-058@v1` — the Shared email names the sharer, lists every Day and the total, and links to the read-only view
- `@covers REQ-TRV-058@v1` — a Trip name or Activity title containing a line break stays on one line in the email
- `@covers REQ-TRV-055@v1` — the Trip Created email has the Trip name, Destination, dates and a link to the Trip, and no Activity or estimate
- `@covers REQ-TRV-056@v1` — the Itinerary Updated email names the Trip
- `@covers REQ-TRV-057@v1` — the reminder email names the Trip and its link uses https when the public address does

### A — `tests/unit/share-token.test.ts`
- `@covers REQ-TRV-058@v1` — a token is long, random and different every time
- `@covers REQ-TRV-058@v1` — a token does not contain the Trip's identifier
- `@covers REQ-TRV-058@v1` — one character of a token changed no longer finds the share (tested at each position)
- `@covers REQ-TRV-058@v1` — only the hash of a token is stored
- `@covers REQ-TRV-058@v1` — a link 31 days old is expired and one 29 days old is not; a revoked one is refused

### A — `tests/unit/share-service.test.ts`
- `@covers REQ-TRV-058@v1` — the 11th recipient of a Trip in a day is refused and no email is sent; the 10th is not
- `@covers REQ-TRV-058@v1` — the limit counts per Trip and per day, so another Trip, or the next day, starts again
- `@covers REQ-TRV-058@v1` — the Traveler's own Plan email does not use up a recipient
- `@covers REQ-TRV-059@v1` — "friend-at-example" is refused, naming the recipient field, and nothing is sent or recorded
- `@covers REQ-TRV-058@v1` — if sending fails nothing is recorded and the limit is not used

### A — `tests/unit/notification-service.test.ts`
- `@covers REQ-TRV-055@v1` — sent when on for the application and for the Traveler; not when the Traveler's switch is off; not when the Administrator's is off even though the Traveler's is on
- `@covers REQ-TRV-056@v1` — sent at most once an hour per Trip: none after 20 minutes, one after 61, and the boundary at exactly 60
- `@covers REQ-TRV-056@v1` — a second Trip is not held back by the first
- `@covers REQ-TRV-060@v1` — each event is switched on its own; switching one off leaves the others
- `@covers REQ-TRV-092@v1` — nothing is sent to a disabled Traveler; nothing to an unconfirmed one

### A — `tests/unit/reminder-schedule.test.ts`
- `@covers REQ-TRV-057@v1` — for a start of 2026-10-10 the reminder point is 09:00 on 2026-10-07 in the configured timezone
- `@covers REQ-TRV-057@v1` — due at 09:00, not due at 08:59
- `@covers REQ-TRV-057@v1` — the point is 09:00 local across a daylight-saving change (Sydney, Los Angeles)
- `@covers REQ-TRV-057@v1` — a Trip created on 2026-10-08 for 2026-10-10 is never due, on any day up to the start
- `@covers REQ-TRV-057@v1` — a Trip whose reminder was recorded is not due again
- `@covers REQ-TRV-057@v1` — a Trip that has already started is not due, however long the application was down
- `@covers REQ-TRV-057@v1` — two overlapping checks send one email between them
- `@covers REQ-TRV-057@v1` — a failed send is not recorded, so the next check tries again
- `@covers REQ-TRV-092@v1` — a disabled Traveler's Trip is not due

### A — other
- `tests/unit/config.test.ts` additions: `@covers REQ-TRV-054@v1` — in development the transport must be a file outbox or SMTP to `127.0.0.1` or `localhost`, and anything else refuses to start; production may use any host; `APP_TIMEZONE` must be a real timezone; `APP_ENV` is required
- `tests/unit/notification-schemas.test.ts`: `@covers REQ-TRV-060@v1` — the Traveler's settings have exactly three keys, all on by default, and any other key (including one for account or share emails) is refused
- `tests/unit/notification-view-state.test.ts`, `share-view-state.test.ts`: `@covers REQ-TRV-060@v1`, `@covers REQ-TRV-058@v1` — the wording of the switches, of an expired or revoked link, and of a refused recipient

### C — `tests/api/plan-email.http.spec.ts`
- `@covers REQ-TRV-054@v1` — POST plan/email sends one email to traveler@example.com from the configured sender
- `@covers REQ-TRV-054@v1` — it lists all 8 Days and the total 3200 USD and has a link that opens the read-only view
- `@covers REQ-TRV-054@v1` — generating and regenerating a Plan captures no email carrying it
- `@covers REQ-TRV-032@v1` — the email carries the recommendation words; the read-only view returns them too
- 401 without a login, the same 404 for another Traveler's Trip, `PLAN_NOT_FOUND` for a Trip with no Plan (supplementary)

### C — `tests/api/plan-share.http.spec.ts`
- `@covers REQ-TRV-058@v1` — sharing with friend@example.com captures one email to that address, naming Jane Citizen
- `@covers REQ-TRV-058@v1` — the link opens the read-only view with no cookie and the view has no way to change the Plan (every write to it is refused)
- `@covers REQ-TRV-058@v1` — after 31 days the link is 410; after revoking it is 404 and shows no Plan; with one character changed it is 404; the token does not contain the Trip id
- `@covers REQ-TRV-058@v1` — the 11th recipient in a day is 429-style refused, no email; the next day works again
- `@covers REQ-TRV-059@v1` — "friend-at-example" is 400 with field `recipient`, no email captured
- `@covers REQ-TRV-058@v1` — only the owner can list, share or revoke; a Trip that is deleted stops its links working (supplementary)

### C — `tests/api/trip-emails.http.spec.ts`
- `@covers REQ-TRV-055@v1` — creating a Trip captures one Trip Created email with name, Destination, dates and link, and no Plan content
- `@covers REQ-TRV-055@v1` — editing the Trip captures no further one; switched off by the Traveler, none; switched off by the Administrator, none
- `@covers REQ-TRV-056@v1` — changing the dates of a Trip with a Plan captures one Itinerary Updated; so does changing the Destination (once, not twice) and regenerating the whole Plan
- `@covers REQ-TRV-056@v1` — regenerating a Day, editing an Activity and accepting a chat change capture none
- `@covers REQ-TRV-056@v1` — a second whole regeneration 20 minutes later captures none; 61 minutes later, one
- `@covers REQ-TRV-056@v1` — switched off by the Traveler, none
- `@covers REQ-TRV-056@v1` — a failing mail service does not stop the Trip being saved or the Plan regenerated

### C — `tests/api/trip-reminder.http.spec.ts`
- `@covers REQ-TRV-057@v1` — with the clock at 09:00 on 2026-10-07 and a Trip starting 2026-10-10, the running application sends one reminder with nobody logged in; at 08:59 none
- `@covers REQ-TRV-057@v1` — it is not sent twice, including across a restart of the application over the same database
- `@covers REQ-TRV-057@v1` — its link starts with the public https address
- `@covers REQ-TRV-057@v1` — a Trip created on 2026-10-08 gets none; a Traveler with the reminder off gets none
- `@covers REQ-TRV-092@v1` — a disabled Traveler's Trip gets none, and re-enabling them before the reminder point restores it

### C — `tests/api/notification-settings.http.spec.ts`
- `@covers REQ-TRV-060@v1` — a new Traveler's settings show the three events, each on
- `@covers REQ-TRV-060@v1` — PATCH switches one off and it is still off after logging in again; an unknown key is 400
- `@covers REQ-TRV-060@v1` — an Administrator's switch off for everyone stops the email for a Traveler who has it on
- `@covers REQ-TRV-060@v1` — with all three off, a password reset is still captured
- 401 for a Traveler on the admin route, 401 with no login (supplementary; the admin-route guard test covers the new route)

### B — `e2e/email.spec.ts`
- `@covers REQ-TRV-054@v1` — a Traveler clicks "Email me this Plan", is told it was sent, and the outbox holds one email with the Days, the total and the link
- `@covers REQ-TRV-058@v1` — a Traveler shares with a friend, the friend's email is in the outbox, and its link opens the read-only Plan with nobody logged in, and shows the recommendation notice and no controls
- `@covers REQ-TRV-058@v1` — the Traveler revokes the link and opening it again is refused
- `@covers REQ-TRV-059@v1` — a malformed address is refused on the page beside the recipient field and no email is written to the outbox

### B — `e2e/notifications.spec.ts`
- `@covers REQ-TRV-060@v1` — a new Traveler's Profile page offers three switches, each on, and none for account confirmation, password reset or shares
- `@covers REQ-TRV-060@v1` — an Administrator switches Itinerary Updated off for everyone on the admin page and it is still off after reloading
- `@covers REQ-TRV-092@v1` — two Travelers each have a Trip due a reminder; the Administrator disables one; the enabled one's reminder reaches the outbox and the disabled one's never does (the enabled one is the proof the check has run)

### Existing tests that must stay green
Every test in slices 1 to 10. The ones to watch are `config.test.ts` (new required settings), the admin route guard test, the Profile e2e,
`trips.spec.ts` (Trip creation now sends an email), and every test that builds the application (a new dependency is added to `buildApp`).

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend all.

1. **ADR-0005 finally written**, plus: every email includes its sender and goes through `EmailService`.
2. **Share tokens are 256-bit, random, stored only as a hash.**
3. **One notification service owns the send rules**; the routes only report what happened.
4. **Reminders run from a check every 15 minutes inside the application**, claim before sending, and record on the Trip.
5. **`APP_TIMEZONE` and `APP_ENV` are required settings**, with the development mail rule.

## What I am unsure about

- **If the application is down at 09:00.** The requirement says sent at 09:00. I send at the first check after it, up to the start
  date, and never after. Nothing says how late is too late.
- **A Trip created just before its reminder point.** "Created less than 3 days before it starts gets none": I read that as created
  after the reminder point. A Trip created at 08:00 on the reminder day gets one.
- **Dates changed after a reminder was sent.** "Never sent twice" wins: no second reminder, even for a new date. If dates change
  before it is sent, the point moves with them.
- **Is a Plan's first generation an "update"?** I say no, since nothing was updated and the Plan email is separate. No criterion says.
- **What Itinerary Updated contains.** Only "naming the Trip" is required. I would give the Trip name, what changed (dates,
  Destination or the whole Plan), and a link to the Trip, with no Plan summary, so it does not need the recommendation label.
- **Revocation.** REQ-TRV-058 needs a revoked link refused but no criterion says how a Traveler revokes it. ANSWERS.md says they can, so I
  add the list and the Revoke button.
- **A deleted Trip or a disabled account.** I refuse the links of a deleted Trip while it is deleted, and it comes back if restored.
  I do not refuse links because the sharer was later disabled. Neither is in a criterion.
- **Abuse of the share form.** Ten recipients per Trip per day is the only limit, so a Traveler with many Trips could mail many people
  from the application's address. A per-account daily cap would be a new requirement.
- **Plain text only.** Simple and safe, but a client may expect a formatted email. HTML would be a design and safety change of its own.
- **Where the "Trip Reminder" link goes.** To the Trip page, which needs a login. That is not stated.
- **Bounces and delivery.** The application knows a message was handed over, not that it arrived. Not covered by any requirement.
- **The read-only page and the token in the address.** The token is in the URL, so it can appear in a browser history or a log. The
  page sends no referrer and no caching, and access logs must not record it; I will check the logger.

## Review triggers

Blocking, in the project's own rules: an unauthenticated public route, secrets in a link, email to addresses a user types, a
background job, and new stored data. I would run **security-reviewer** twice (after the read-only view and shares, and at the end),
then **typescript-reviewer**, **react-reviewer** and **database-reviewer** on the migration.

## Then

Waiting for you. Answer the seven items at the top (item 1, the split, first), or say "I approve" to take my recommendations, then run
`/tdd REQ-TRV-054 REQ-TRV-032 REQ-TRV-055 REQ-TRV-056 REQ-TRV-057 REQ-TRV-058 REQ-TRV-059 REQ-TRV-060 REQ-TRV-092`. You are already on
`feat/trv-email`.
