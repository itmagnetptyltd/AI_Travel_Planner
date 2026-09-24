# Plan — Slice 1 Accounts

Covers REQ-TRV-001@v1, REQ-TRV-002@v1, REQ-TRV-003@v1, REQ-TRV-004@v1,
REQ-TRV-005@v1, REQ-TRV-006@v1, REQ-TRV-009@v1, REQ-TRV-010@v1.
All `agreed`. Branch `feat/trv-accounts`. Gate: previous slices Done (none).

Stack chosen by the developer 2026-09-23: **TypeScript full-stack, SQLite.**
Nothing in `.brain/decisions/`, `rejected/` or `constraints/` yet.

---

## What must be true

### REQ-TRV-001 — register (A B C)
1. Registering `traveler@example.com` with a valid password creates a Traveler account that can log in.
2. Registering an email that already has an account is refused: "already registered".
3. An 11-character password is refused, the password field is named, and no account exists.
4. A 12-character all-lowercase password that is not breached is accepted. No character-mix rule.
5. A 128-character non-breached password is accepted.
6. A 129-character password is refused, and the password field is named.
7. A password of 12 or more characters on the breached list is refused, and the password field is named.
8. The stored password is an Argon2id hash that verifies against the entered password.
9. Registering sends exactly one confirmation email, with a confirmation link, to the registered address.
10. An unconfirmed account trying to create a Trip is refused with "confirm your email first".
11. A confirmation link 23 hours old confirms the account, and its owner can then create a Trip.
12. A confirmation link 25 hours old is refused as expired, and the account stays unconfirmed.
13. The registration page shows the privacy notice: Trip details go to a third-party AI service that may process them outside Australia.

### REQ-TRV-002 — log in and reset password (A B C)
1. Correct email and password logs the Traveler in and shows their list of Trips.
2. Requesting a reset sends exactly one reset email, with a link, to that Traveler.
3. A reset link 50 minutes old sets a new password: the new one logs in and the old one no longer does.
4. A reset link already used once is refused, and the password is unchanged.
5. A reset link 61 minutes old is refused as expired, and the password is unchanged.

### REQ-TRV-003 — wrong password refused (A B C)
1. A wrong password creates no session and shows a login error.

### REQ-TRV-004 — log out (A B C)
1. After logging out, requesting the Trip list is refused as not logged in.

### REQ-TRV-005 — Trip surfaces require login (A B C)
1. Any Trip API endpoint called without a session returns **401**.
2. Opening a Trip page without a session shows the login page instead.

### REQ-TRV-006 — password never stored as entered (A)
1. No stored field of the account contains the plaintext password.

### REQ-TRV-009 — update profile (A B C)
1. A changed profile detail is shown when the profile is next opened.

### REQ-TRV-010 — profile preferences (A B C)
1. Setting USD, Family and Vegetarian, then reopening the profile, shows USD, Family and Vegetarian.
2. A new Trip form is pre-filled with the profile's USD, Family and Vegetarian.
3. Changing the profile's default travel style to Luxury leaves a saved Trip, and its Plan, at Family.
4. The preferred currency choice offers exactly AUD, USD, EUR, GBP, JPY, SGD, NZD and BDT.

---

## Approach

**Layout.** There is one `package.json` at the root. All application code goes
under `src/`.

- `src/server/` holds the Fastify Web API. It follows BRD §23: routes, then
  services, then repositories, then the database.
- `src/web/` holds a React single-page app built by Vite. In production,
  Fastify serves the built files.
- `src/shared/` holds the zod schemas and `as const` option lists used by both
  sides: currencies, travel styles and food preferences.

**Accounts.**
- **Registration** validates the input with zod. Password length must be
  12–128 characters, with no mix rule.
- **Breached passwords:** the password is checked against a
  `BreachedPasswordChecker` interface.
- **Hashing:** passwords are hashed with Argon2id (`@node-rs/argon2`).
- **Storage:** the account is stored with `role = 'traveler'` and
  `email_confirmed_at = null`.
- **Email tokens:** confirmation and reset tokens are 32 random bytes from
  `crypto.randomBytes`, and only their SHA-256 hash is stored.
  - Each token carries `purpose`, `expires_at` and `used_at`.
  - Confirmation tokens last 24 hours. Reset tokens last 1 hour and can be used
    once.
- **Clock:** every expiry check reads time from an injected `Clock`, so the
  23/25-hour and 50/61-minute tests need no real waiting.

**Sessions.**
- Sessions are stored on the server in the database.
- The browser holds only a random session id, in an `httpOnly` cookie set to
  `secure` in production and `sameSite: 'lax'`.
- Logging out deletes the session row.
- A `requireTraveler` preHandler returns 401 to API callers without a valid
  session.
- A `requireConfirmedTraveler` preHandler refuses unconfirmed accounts. It is
  used later by Trip creation.
- In the React app, a route guard sends visitors without a session to `/login`.

**Email.**
- Code sends email only through an `EmailService` interface.
- **SMTP:** `SmtpEmailService` uses nodemailer. It sends to Mailpit in
  development and to the client's provider later.
- **In tests:** `CapturingEmailService` records messages instead of sending
  them.
- **Links:** confirmation and reset links are built from `APP_BASE_URL`.

**Config.** `src/server/config.ts` reads the environment once, through a zod
schema, and the app refuses to start if a value is missing. `.env.example` is
committed with empty values.

**Trip surface needed by this slice.** Several criteria refer to Trips, which
are built in slice 3. This slice adds only:
- A guarded `GET /api/trips` that returns `[]`. The real list arrives with
  REQ-TRV-016.
- A guarded `POST /api/trips` that currently returns **501**. It runs the
  `requireConfirmedTraveler` check first, which makes 001 criteria 10 and 11
  testable.
- An empty `/trips` page.

The ownership that REQ-TRV-007 needs comes in slice 3.

### Files to create

- **Root files:**
  - `package.json` and `package-lock.json`
  - `tsconfig.json`, which is strict and turns on `noUncheckedIndexedAccess`,
    `noImplicitOverride` and `exactOptionalPropertyTypes`
  - `vite.config.ts`, `vitest.config.ts` and `playwright.config.ts`
  - `eslint.config.js`, `.prettierrc` and `.env.example`
- **`src/shared/`:**
  - Option lists: `currencies.ts`, `travel-styles.ts`, `food-preferences.ts`
  - Validation schemas: `account-schemas.ts`, `profile-schemas.ts`
- **`src/server/` top level:**
  - Startup and config: `main.ts`, `app.ts` (`buildApp(deps)`), `config.ts`
  - Shared services: `clock.ts`, `logger.ts`
- **`src/server/db/`:**
  - `client.ts`, using better-sqlite3 with the WAL journal
  - `schema.ts`, the Drizzle schema for the `accounts`, `sessions`,
    `email_tokens` and `profiles` tables
  - `migrations/`
- **`src/server/accounts/`:**
  - `password-policy.ts`, `password-hasher.ts` and
    `breached-password-checker.ts`
  - `account-repository.ts`, `account-service.ts`, `email-token-service.ts` and
    `session-service.ts`
  - `require-traveler.ts`, `account-routes.ts` and `profile-routes.ts`
- **`src/server/email/`:** `email-service.ts`, `smtp-email-service.ts` and
  `account-email-templates.ts`
- **`src/server/trips/trip-routes.ts`:** the guarded placeholder routes only
- **`src/web/` top level:** `index.html`, `main.tsx`, `App.tsx`,
  `api-client.ts` and `require-session.tsx`
- **`src/web/pages/`:**
  - Account pages: `RegisterPage.tsx`, `LoginPage.tsx`, `ConfirmEmailPage.tsx`
  - Password reset pages: `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
  - Signed-in pages: `ProfilePage.tsx`, `TripsPage.tsx`
- **`src/web/components/`:** `PrivacyNotice.tsx` and `Toast.tsx`
- **`tests/support/`:** `build-test-app.ts` (in-memory SQLite, fixed clock,
  capturing email), `capturing-email-service.ts` and `a-traveler.ts` (a test
  data factory)

---

## Test skeleton

Test types (belts):
- **A — unit:** Vitest, `tests/unit/**/*.test.ts`.
- **C — API:** Vitest plus Fastify `inject` against a real in-memory SQLite
  database migrated from scratch, `tests/api/**/*.http.spec.ts`.
- **B — browser:** Playwright, `e2e/**/*.spec.ts`. The server runs with a file
  outbox as its email transport.

### Belt A (unit)
```ts
// @covers REQ-TRV-001@v1
test('an 11-character password is refused and names the password field')
test('a 12-character lowercase-only password passes the policy')
test('a 128-character password passes the policy')
test('a 129-character password is refused and names the password field')
test('a breached password of 12+ characters is refused and names the password field')
test('a hashed password is Argon2id and verifies against the original')          // → $argon2id$ prefix, verify() true
test('a confirmation token 23 hours old is accepted')                              // fixed clock
test('a confirmation token 25 hours old is refused as expired')
// @covers REQ-TRV-002@v1
test('a reset token 50 minutes old is accepted')
test('a reset token 61 minutes old is refused as expired')
test('a reset token that was already used is refused')
// @covers REQ-TRV-003@v1
test('verifying a wrong password returns a refusal, not a session')
// @covers REQ-TRV-006@v1
test('no stored account field contains the plaintext password')                   // scan every column of the row
// @covers REQ-TRV-004@v1
test('ending a session makes its id invalid')
// @covers REQ-TRV-005@v1
test('requireTraveler refuses a request with no valid session')
// @covers REQ-TRV-009@v1
test('updating a profile detail returns the new value on the next read')
// @covers REQ-TRV-010@v1
test('the currency list is exactly AUD USD EUR GBP JPY SGD NZD BDT')
test('a currency outside the list is refused by the profile schema')
```

### Belt C (API)
```ts
// @covers REQ-TRV-001@v1
test('POST /api/accounts creates an account that can then log in')              // 201, then login 200
test('POST /api/accounts with a registered email returns 409 already registered')
test('POST /api/accounts with an 11-character password returns 400 naming password and creates no account')
test('POST /api/accounts with a breached password returns 400 naming password')
test('registering captures exactly one confirmation email to the registered address with a link')
test('an unconfirmed account calling POST /api/trips is refused with confirm-email-first')   // 403 code EMAIL_NOT_CONFIRMED
test('a 23-hour-old confirmation link confirms and POST /api/trips is no longer refused for confirmation')
test('a 25-hour-old confirmation link returns 410 and the account stays unconfirmed')
// @covers REQ-TRV-002@v1
test('POST /api/sessions with correct credentials sets a session cookie and GET /api/trips returns 200')
test('POST /api/password-resets captures exactly one reset email to that address')
test('a 50-minute-old reset link sets the password; new logs in, old returns 401')
test('a reused reset link returns 410 and the password is unchanged')
test('a 61-minute-old reset link returns 410 and the password is unchanged')
// @covers REQ-TRV-003@v1
test('POST /api/sessions with a wrong password returns 401 and sets no session cookie')
// @covers REQ-TRV-004@v1
test('after DELETE /api/sessions/current, GET /api/trips returns 401')
// @covers REQ-TRV-005@v1
test.each(['GET /api/trips', 'POST /api/trips'])('%s without a session returns 401')
// @covers REQ-TRV-009@v1
test('PATCH /api/profile then GET /api/profile returns the changed value')
// @covers REQ-TRV-010@v1
test('PATCH /api/profile with USD, Family, Vegetarian then GET /api/profile returns them')
test('PATCH /api/profile with currency CAD returns 400 naming preferredCurrency')
```

### Belt B (browser)
```ts
// @covers REQ-TRV-001@v1
test('registration page shows the third-party AI privacy notice')
test('a visitor registers, confirms from the emailed link and reaches their Trips')
test('registering with a short password shows the password field error')
// @covers REQ-TRV-002@v1
test('a Traveler logs in and sees their list of Trips')
test('a Traveler resets a forgotten password from the emailed link and logs in with it')
// @covers REQ-TRV-003@v1
test('logging in with a wrong password shows a login error and stays on the login page')
// @covers REQ-TRV-004@v1
test('after logging out, opening Trips shows the login page')
// @covers REQ-TRV-005@v1
test('opening a Trip page with no session shows the login page')
// @covers REQ-TRV-009@v1
test('a Traveler changes their display name and sees it after reload')
// @covers REQ-TRV-010@v1
test('a Traveler sets USD, Family and Vegetarian and sees them after reload')
test('the preferred currency choice offers exactly the eight listed currencies')
```

**Criteria deliberately not tested in this slice.** These are REQ-TRV-010
criteria 2 and 3. They need the Trip form and saved Trips, which come from
REQ-TRV-011 in slice 3 and REQ-TRV-020 in slice 6. Their tests will be written
in those slices, still annotated `@covers REQ-TRV-010@v1`. See the first
uncertainty below.

---

## Decisions this forces (ADRs to write before or with the code)

- **ADR-0001 — Stack.**
  - TypeScript, Node 20, a Fastify Web API, and a React + Vite single-page app
    served by Fastify.
  - Tests use Vitest and Playwright.
  - The alternatives were C#/ASP.NET, Python/FastAPI and plain JavaScript. The
    developer chose TypeScript on 2026-09-23.
- **ADR-0002 — SQLite, using better-sqlite3 and Drizzle ORM.**
  - Drizzle builds parameterised queries and handles migrations.
  - Consequence: the public host needs a persistent volume.
  - Consequence: there is one writer at a time, so WAL mode must be on.
  - Consequence: moving to PostgreSQL later means a data migration.
  - Chosen by the developer 2026-09-23. PostgreSQL was the alternative.
- **ADR-0003 — Sessions on the server, in a cookie, rather than JWTs.** Logout
  and account disabling must take effect at once, which REQ-TRV-004 and
  REQ-TRV-071 need. Server-side sessions do that; stateless JWTs do not.
- **ADR-0004 — Where the breached-password list comes from.**
  - **(a) Have I Been Pwned range API.** Only the first 5 characters of the
    password's SHA-1 hash leave the server. It is a new outbound dependency and
    needs a decision on what happens when that service is down.
  - **(b) A bundled list of the top 100k breached passwords.** No network is
    needed, but coverage is weaker.
  - I lean towards (b) for a demo, but this is the developer's call.
- **ADR-0005 — Email goes only through `EmailService`.**
  - SMTP via nodemailer.
  - Mailpit in development, a file outbox for Playwright, and the provider
    chosen later (SES, Postmark or SendGrid are all still open).

**New dependencies** each need review:
- **Runtime:** fastify, @fastify/cookie, @fastify/static, zod, drizzle-orm,
  better-sqlite3, @node-rs/argon2, nodemailer, react, react-dom, react-router.
- **Development:** typescript, tsx, vite, @vitejs/plugin-react, vitest,
  @vitest/coverage-v8, @playwright/test, drizzle-kit, eslint,
  typescript-eslint, prettier.

---

## What I am unsure about

1. **REQ-TRV-010's `depends_on` is incomplete.** Criteria 2 and 3 need Trips
   (REQ-TRV-011) and travel style (REQ-TRV-020), which are built in later
   slices. Because of that, `/close-slice` can't mark 010 verified in this
   slice unless those criteria are carried forward.
   - **Options:**
     - (a) Build only criteria 1 and 4 now, and leave 010 `in_progress` until
       slice 6.
     - (b) Move 010 into slice 6 with a `/slice-add` change.
   - Either is a record change. **I need your pick.**
2. **REQ-TRV-009 "a profile detail" doesn't say which fields a profile has.**
   The BRD §17 names only the preferences.
   - I propose one field for now, **display name**.
   - Changing the email address would need re-confirmation, and I'd leave it
     out.
   - If the client means more than this, it is an open question, not my choice
     to make.
3. **The login lockout is not in any requirement.** The confirmed "Password
   rules" answer asks for 5 failed attempts to lock the account for 15 minutes.
   - It is flagged as behaviour with no requirement.
   - I will **not** build it here unless a `/change-record` adds it, for
     example to REQ-TRV-003.
   - Basic rate limiting per IP address on the auth endpoints is a security
     baseline, not scope. I'll include it unless you object.
4. **REQ-TRV-002 criterion 1** says the Traveler is shown "their list of Trips".
   Until slice 3 that list is always empty, so the test checks the Trips page
   heading and the empty state.
5. **The reset-request response.** To avoid revealing which emails have
   accounts, `POST /api/password-resets` returns the same 202 whether or not
   the email is registered. No criterion requires this, but the security rules
   do.
6. **The Traveler's admin role.** `role` is stored now so that slice 2
   (REQ-TRV-068) can add Administrators. Seeding the first Administrator
   belongs to slice 2, not here.
7. **Glossary.** I use "Traveler" and "food preference", following the
   confirmed answers. The glossary change is still unreviewed and not merged.
