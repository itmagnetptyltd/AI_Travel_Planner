# Plan — Slice 2 Admin and Destinations

Covers REQ-TRV-068@v2, REQ-TRV-071@v2, REQ-TRV-072@v2, REQ-TRV-073@v1,
REQ-TRV-074@v2, REQ-TRV-075@v2, REQ-TRV-078@v2. All `agreed`.
Branch `feat/trv-destinations`, stacked on `feat/trv-accounts` until slice 1 merges.
Gate: slice 1 Done (8/8).

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing
recorded governs this plan and no rejected approach is being re-proposed.

---

## Settled by CHG-0001 (2026-09-24)

The nine criteria that needed later slices were moved to REQ-TRV-091..095
(slices 3, 4, 7 and 11). Developer chose option (b) and approved the rest of this
plan as written, 2026-09-24. Every criterion below is buildable in this slice.

---

## What must be true (buildable now)

### REQ-TRV-068 — only Administrators reach admin functions (A B C)
1. A Traveler who is not an Administrator gets **403** from every `/api/admin/*` endpoint.
2. An Administrator opening `/admin` sees the admin dashboard.
3. Running the seed command for `admin@example.com` on a fresh database creates an Administrator who can log in and open the dashboard.
4. An Administrator promotes a confirmed Traveler after a confirmation step. The Traveler can then open the dashboard, and an audit log entry records who promoted whom.
5. Promoting a Traveler whose email address is not confirmed is refused, and that Traveler still gets 403.
6. An Administrator demotes another Administrator after confirming. The demoted one gets 403, and an audit log entry records the demotion.
7. The only Administrator trying to demote themselves is refused, and stays an Administrator.
8. The admin functions offered are exactly: users, Destinations, feedback, notification settings, AI usage limits. There is no editing of site text or email templates.

### REQ-TRV-071 — manage user accounts (A B C)
1. The user list shows every Traveler by email address.
2. Disabling Traveler T refuses T's next login, and an audit log entry records it.
4. Re-enabling T lets T log in again.
5. The actions offered on an account are view, disable or re-enable, and change role. Editing profile details and deleting the account are not offered.
6. An Administrator sending a profile change for a Traveler through the API gets **403**, and the profile is unchanged.

### REQ-TRV-072 — add a Destination (A B C)
1. Adding Kyoto with a description, popular activities, recommended duration and travel information shows Kyoto in the Destination list with those four values.
3. A Traveler opening Kyoto's detail view sees those four values.

### REQ-TRV-073 — edit a Destination (A B C)
1. Changing Kyoto's recommended duration from 3 to 4 days shows Kyoto with 4 days.

### REQ-TRV-074 — disabled Destination not offered (A B C)
1. Once Kyoto is disabled, a Traveler searching for "Kyoto" does not get Kyoto.
2. The Administrator's Destination list still shows Kyoto, marked as disabled.

### REQ-TRV-075 — remove a Destination (A B C)
1. Removing an unused Kyoto takes it out of the Administrator's Destination list.

### REQ-TRV-078 — search Destinations (A B C)
1. Searching enabled Destinations for "Kyo" returns Kyoto and not Tokyo.

---

## Approach

**Data (migration `0001_admin_destinations.sql`)**
- `accounts` gains `disabled_at` (nullable timestamp). `role` already exists from slice 1.
- New `destinations` table:
  - `id`, `name`, `country`
  - `description`, `popular_activities`, `recommended_duration_days` (integer)
  - `travel_information`, `disabled_at`, `created_at`, `updated_at`
  - Unique on `(name, country)`.
- New `audit_log` table: `id`, `actor_account_id`, `action`, `subject_type`, `subject_id`, `occurred_at`. It is only ever added to, never updated or deleted from. It is shared with REQ-TRV-070 in slice 12.

**Access control**
- `requireAdministrator(accounts)` is a preHandler that runs after `requireTraveler`. It returns **403** `NOT_AN_ADMINISTRATOR` unless the account's role is `administrator` and the account is enabled.
- Every route under `/api/admin/*` is registered inside one Fastify plugin scope that has both hooks, so a new admin route is protected by default. A test lists the registered admin routes and checks that each one returns 403 to a Traveler (068 criterion 1).
- **Disabled accounts:** login refuses a disabled account with the same 401 as a wrong password, so the refusal does not reveal whether an account is disabled. Disabling also deletes the account's sessions, so the change takes effect at once. This is the reason ADR-0003 gave for server-side sessions.

**Accounts administration** (`src/server/admin/`)
- `admin-account-service.ts`: `listAccounts`, `disable`, `enable`, `promote`, `demote`. Each change writes an audit entry in the same transaction.
- Promotion requires a confirmed email address.
- Demotion refuses to leave zero Administrators, which covers the last Administrator demoting themselves.
- `admin-account-routes.ts`:
  - `GET /api/admin/accounts`
  - `POST /api/admin/accounts/:id/disable` and `/enable`
  - `PUT /api/admin/accounts/:id/role`
- There is deliberately **no** admin route for profile details. `PATCH /api/profile` only ever edits the caller's own profile, so an Administrator's attempt to change a Traveler's profile needs a route to aim at. For 071 criterion 6 I propose `PATCH /api/admin/accounts/:id/profile`, which exists only to return 403 and change nothing (see uncertainty 3).
- **Confirmation step:** the web app asks "Promote T to Administrator?" and the API requires `confirm: true` in the body. Without it, the API returns 400.

**Destinations** (`src/server/destinations/`)
- `destination-service.ts` handles add, edit, disable, enable, remove, list-for-admin, search-for-traveler and get-for-traveler.
- **Search** is a case-insensitive "contains" match on name, over enabled Destinations only, capped at 20 results. It uses a parameterised `LIKE` with `%` and `_` escaped.
- **Remove** is a hard delete. It checks for Trips using the Destination through a `DestinationUsage` function that returns 0 until slice 3 adds the `trips` table (see uncertainty 4).
- Routes:
  - Admin: `GET/POST /api/admin/destinations`, `PATCH /api/admin/destinations/:id`, `POST .../:id/disable` and `.../:id/enable`, `DELETE .../:id`
  - Traveler: `GET /api/destinations?q=` and `GET /api/destinations/:id`
- `src/shared/destination-schemas.ts` holds the zod schemas, which also set the length limits. These texts later go to the AI prompt, which the client said must be length-limited:
  - description 2000 characters
  - popular activities 1000
  - travel information 2000
  - recommended duration 1–60 days

**Seed step**
- `scripts/seed-administrator.ts`, run with `npm run seed:admin -- admin@example.com`.
- It reads the password from the `SEED_ADMIN_PASSWORD` environment variable, never from the command line, so the password stays out of shell history.
- It applies the same password policy as registration, creates a confirmed Administrator, and refuses if that email address already has an account.
- For tests, the logic lives in `src/server/admin/seed-administrator.ts`, and the script only calls it.

**Web** (`src/web/`)
- `pages/admin/AdminDashboardPage.tsx` — the admin navigation with the five functions from 068 criterion 8. Feedback, notification settings and AI usage limits show "Not available yet" until their slices land (see uncertainty 2).
- `pages/admin/AdminUsersPage.tsx`, `pages/admin/AdminDestinationsPage.tsx`, `pages/admin/DestinationForm.tsx`.
- `pages/DestinationsPage.tsx` — Traveler search over Destinations, with a link to `pages/DestinationDetailPage.tsx`. Slice 3's Trip form reuses the same search component, `components/DestinationSearch.tsx`.
- `require-administrator.tsx` — a route guard that sends non-Administrators to their Trips.
- Every value is rendered as React text. There is no HTML rendering of Destination fields.

**Files changed:**
- `src/server/db/schema.ts`
- `src/server/app.ts`
- `src/server/accounts/account-service.ts` (refuse a disabled account at login)
- `src/server/accounts/session-service.ts` (delete all sessions for an account)
- `src/web/App.tsx`
- `package.json` (the `seed:admin` script)
- `tests/support/build-test-app.ts` and `a-traveler.ts` (add `anAdministrator`)

**New dependencies:** none.

---

## Test skeleton

### Belt A (unit) — `tests/unit/`
```ts
// @covers REQ-TRV-068@v2
test('requireAdministrator refuses a logged-in Traveler with 403')
test('requireAdministrator admits an enabled Administrator')
test('the seed step creates a confirmed Administrator who can log in')
test('the seed step refuses an email that already has an account')
test('promoting a confirmed Traveler makes them an Administrator and records an audit entry')
test('promoting an unconfirmed Traveler is refused')
test('demoting another Administrator records an audit entry')
test('the only Administrator cannot demote themselves')
test('the admin functions are exactly users, Destinations, feedback, notification settings and AI usage limits')
// @covers REQ-TRV-071@v2
test('disabling a Traveler refuses their next login and records an audit entry')
test('disabling a Traveler ends their existing sessions')
test('re-enabling a Traveler lets them log in again')
test('the account actions are view, disable or re-enable, and change role')
// @covers REQ-TRV-072@v2
test('an added Destination is returned with its description, activities, duration and travel information')
test('a Destination description over 2000 characters is refused')
// @covers REQ-TRV-073@v1
test('changing the recommended duration from 3 to 4 days returns 4 days')
// @covers REQ-TRV-074@v2
test('a disabled Destination is not returned by Traveler search')
test('a disabled Destination is still listed for Administrators, marked disabled')
// @covers REQ-TRV-075@v2
test('removing an unused Destination deletes it')
// @covers REQ-TRV-078@v2
test('searching "Kyo" returns Kyoto and not Tokyo')
test('search treats % and _ as literal characters')
```

### Belt C (API) — `tests/api/`
```ts
// @covers REQ-TRV-068@v2
test.each(ADMIN_ROUTES)('%s as a Traveler returns 403')        // every registered /api/admin route
test('GET /api/admin/dashboard as an Administrator returns 200')
test('PUT role administrator on a confirmed Traveler returns 200 and they can then reach the dashboard')
test('PUT role without confirm: true returns 400 and changes nothing')
test('PUT role administrator on an unconfirmed Traveler returns 409 and they still get 403')
test('an Administrator demoting another returns 200 and the demoted one then gets 403')
test('the only Administrator demoting themselves returns 409 and stays an Administrator')
// @covers REQ-TRV-071@v2
test('GET /api/admin/accounts lists both Travelers by email address')
test('after disable, POST /api/sessions for that Traveler returns 401')
test('after enable, POST /api/sessions for that Traveler returns 200')
test('PATCH a Traveler profile through the admin API returns 403 and the profile is unchanged')
// @covers REQ-TRV-072@v2
test('POST /api/admin/destinations then GET /api/admin/destinations shows Kyoto with its four values')
test('GET /api/destinations/:id returns the four values to a Traveler')
// @covers REQ-TRV-073@v1
test('PATCH recommendedDurationDays 4 then GET returns 4')
// @covers REQ-TRV-074@v2
test('after disable, GET /api/destinations?q=Kyoto does not return Kyoto')
test('after disable, GET /api/admin/destinations lists Kyoto with disabled true')
// @covers REQ-TRV-075@v2
test('DELETE an unused Destination returns 204 and it is no longer listed')
// @covers REQ-TRV-078@v2
test('GET /api/destinations?q=Kyo returns Kyoto and not Tokyo')
```

### Belt B (browser) — `e2e/admin-destinations.spec.ts`
```ts
// @covers REQ-TRV-068@v2
test('a Traveler opening /admin is sent back to their Trips')
test('the seeded Administrator logs in and sees the five admin functions')
test('an Administrator promotes a confirmed Traveler after confirming, and that Traveler can open the dashboard')
// @covers REQ-TRV-071@v2
test('an Administrator disables a Traveler, whose login is then refused, and re-enables them')
test('the account view offers view, disable and change role, and no edit or delete')
// @covers REQ-TRV-072@v2
test('an Administrator adds Kyoto and a Traveler sees its four values on the detail view')
// @covers REQ-TRV-073@v1
test('an Administrator changes Kyoto to 4 days and the list shows 4 days')
// @covers REQ-TRV-074@v2
test('a disabled Destination is missing from Traveler search and marked disabled for the Administrator')
// @covers REQ-TRV-075@v2
test('an Administrator removes an unused Destination')
// @covers REQ-TRV-078@v2
test('a Traveler searches "Kyo" and sees Kyoto and not Tokyo')
```

### Carried forward
None. The criteria listed here in the first draft now belong to REQ-TRV-091..095.

---

## Decisions this forces

- **ADR — audit log.** A single table that is only ever added to and shared by every admin action, not a log file. Rows are never updated or deleted. Retention is not specified, so it's an open question for the client.
- **ADR — a disabled account ends its sessions immediately.** Otherwise a disabled Traveler stays logged in until their session expires.
- **ADR — the seed step's password comes from an environment variable.** A command-line argument would leave the password in shell history.
- Still unwritten from slice 1: ADR-0001 to ADR-0005.

---

## What I am unsure about

1. **Cross-slice criteria.** See the top of this plan. Pick (a), (b) or (c).
2. **068 criterion 8 names three functions that don't exist yet.** Feedback arrives in slice 12, notification settings in slice 11, and AI usage limits in slice 4. My proposal is to list all five and show "Not available yet" on those three, which satisfies "offered" literally without building them early. If "offered" means working, that criterion is another cross-slice case.
3. **071 criterion 6 is about an endpoint that shouldn't exist.** A deny-only route (`PATCH /api/admin/accounts/:id/profile` returning 403) makes the criterion testable. The alternative is testing that `PATCH /api/profile` can't target another account, which it already can't, because it takes no account id. Which reading does the client mean?
4. **The "in use" check for Remove.** Until slice 3, no Trip can use a Destination, so the check always passes. Slice 3 must replace the placeholder with a real query that includes soft-deleted Trips. If slice 3 forgets, Remove silently deletes Destinations that Trips use, and only 075 criteria 2 and 3 would catch it. Under option (a), those tests must not be dropped.
5. **Destination fields beyond the criteria.** 078 criterion 2 says Kyoto is "in country Japan", and REQ-TRV-077 filters by country, so I've added `country`. §20 also names **city**, but no criterion does, and the glossary lists "country and city" as undefined. I have **not** added city. That's for the client to answer, not me.
6. **Glossary.** "Destination" is still listed as undefined in `glossary.md`, even though ANSWERS.md settles it as a record the Administrator manages that every Trip points to. That glossary update should go through `/checkpoint`. I use "Destination" and "Administrator" as the answers do.
7. **Search matching.** The criterion only needs "Kyo" to find Kyoto. I propose a case-insensitive "contains" match on the name only. Searching by country is not required, so I'm not adding it.
