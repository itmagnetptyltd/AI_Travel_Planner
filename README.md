# AI Travel Planner

A web application where Travelers describe a trip and get a personalised,
editable itinerary. It will combine a trip-planning form, an AI planner, a chat
assistant, email, itinerary management and customer feedback.

The client's brief is in `.brain/requirements/BRIEF.md`. The requirements are in
`.brain/requirements/trv.yaml`, and the build order is in `.brain/slices.yaml`.

## What works today

- **Accounts.** Travelers can register, confirm their email address, log in and
  out, reset a password and edit their profile preferences.
- **Admin and Destinations.** Administrators manage users and the Destination
  list. Travelers can search Destinations.
- **Trips.** Travelers create, list, edit and delete their own Trips.
- **AI Plan generation.** In progress on `feat/trv-plan-generation`: a Traveler can ask the AI for a day-by-day Plan, labelled as a recommendation, with a fallback message when the AI fails.

Saved plans, chat, email and feedback come in later slices.
For current status, open `.claude/reports/dashboard.html` or run `/dashboard`.

## Stack

| Layer | Choice |
|---|---|
| Server | Node 20+, Fastify 5, TypeScript run with `tsx` |
| Database | SQLite (`better-sqlite3`) with Drizzle ORM. Migrations apply on startup |
| Web | React 19, React Router 7, built with Vite |
| Validation | zod, shared between server and web (`src/shared/`) |
| Passwords | Argon2 (`@node-rs/argon2`) plus a bundled breached-password check |
| Email | SMTP (Nodemailer), or files written to an outbox directory |
| Tests | Vitest for unit and API tests, Playwright for browser tests |

## Getting started

Prerequisite: Node.js 20 or later.

```sh
npm install
cp .env.example .env      # then fill in EMAIL_FROM and your email settings
```

The server doesn't load `.env` on its own. Pass it with `--env-file`, or set the
variables in your shell.

### Email locally

Pick one of these:

- **Mailpit.** Set `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=127.0.0.1` and
  `SMTP_PORT=1025`.
- **Files.** Set `EMAIL_TRANSPORT=file` and `EMAIL_OUTBOX_DIR=.outbox`. Each
  email is written there as a file.

For local HTTP you also need `COOKIE_SECURE=false`. Without it, the browser
won't send the session cookie.

### Create the first Administrator

```sh
SEED_ADMIN_PASSWORD='<12–128 chars>' DATABASE_PATH=data/trv.sqlite \
  npm run seed:admin -- admin@example.com
```

The script reads the password from the environment, so it never appears on the
command line.

### Run

```sh
npm run build:web                                  # builds the web app into dist/web
npx tsx --env-file=.env src/server/main.ts         # serves the API and web app
```

Then open `http://127.0.0.1:3000`. For auto-restart while you work, use
`npx tsx watch --env-file=.env src/server/main.ts`.

## Configuration

The server checks every variable at startup. If one is missing or invalid, it
refuses to start and names the problem, without printing the value.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `3000` | |
| `HOST` | no | `127.0.0.1` | |
| `APP_BASE_URL` | yes | | Used for links in emails |
| `DATABASE_PATH` | yes | | SQLite file. Its folder is created if needed |
| `EMAIL_TRANSPORT` | yes | | `smtp` or `file` |
| `EMAIL_FROM` | yes | | Sender address |
| `SMTP_HOST` | when `smtp` | | |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | no | | |
| `EMAIL_OUTBOX_DIR` | when `file` | | |
| `COOKIE_SECURE` | no | `true` | Set to `false` only for local HTTP |
| `AUTH_RATE_LIMIT_PER_MINUTE` | no | `20` | |
| `AI_PROVIDER` | yes | | `anthropic`, or `scripted` for the browser tests (only starts when `NODE_ENV=test`) |
| `AI_API_KEY` | when `anthropic` | | Held server-side only |
| `AI_MODEL` | when `anthropic` | | The model id your account uses |
| `AI_INPUT_COST_MICRO_USD_PER_MTOK`, `AI_OUTPUT_COST_MICRO_USD_PER_MTOK` | when `anthropic` | | Millionths of a US dollar per million tokens, so cost can be recorded |
| `AI_SCRIPT_FILE` | when `scripted` | | JSON file the browser tests write to say what the next AI request does |
| `AI_TIMEOUT_MS` | no | `120000` | A Plan not back by then shows the fallback message |
| `AI_MAX_OUTPUT_TOKENS` | no | `16000` | |
| `AI_DESTINATION_TEXT_MAX_CHARS` | no | `2000` | Each Destination text sent to the AI is cut to this length |

Never commit `.env`. Keep real secrets out of `.env.example`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Starts the server in watch mode (needs the environment set) |
| `npm run build` | Type-checks, then builds the web app |
| `npm run lint` | Runs ESLint and a type check |
| `npm test` | Runs the Vitest unit and API tests |
| `npm run coverage` | Runs the tests with coverage (80% line minimum) |
| `npm run test:integration` | Runs the Playwright browser tests |
| `npm run db:generate` | Generates a Drizzle migration from `src/server/db/schema.ts` |
| `npm run seed:admin -- <email>` | Creates an Administrator |

The browser tests start their own server on port 5174, with a fresh database
and a file outbox, so they don't need your `.env`. To watch them run in
Chromium, use `/run-browsertest` or `scripts/run-browsertest.cmd`.

## Layout

```
src/server/   Fastify app, grouped by feature (accounts, admin, destinations, trips, email, db)
src/shared/   zod schemas and reference lists used by both server and web
src/web/      React app: pages, components, API client
tests/api/    HTTP-level tests
e2e/          Playwright browser tests
scripts/      Admin seed and browser-test launcher
.brain/       Project record: requirements, decisions, constraints, changes
```

## How work is done here

Every change traces back to a requirement id (`REQ-TRV-NNN`). Tests carry
`@covers REQ-TRV-NNN@vN` annotations, and the CI gates in `.github/workflows/`
check them. `CLAUDE.md` lists the workflow commands: `/feature-plan`, `/tdd`,
`/close-slice`, `/pr-prepare` and the rest.

`.brain/` changes only through a reviewed pull request.
