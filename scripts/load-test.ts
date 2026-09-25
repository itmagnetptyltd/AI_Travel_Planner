// Acceptance check for the agreed response times (REQ-TRV-080), run against a deployed address.
//
//   LOAD_TEST_PASSWORD=... npm run load-test -- https://demo.example.com --email traveler@example.com
//   LOAD_TEST_PASSWORD=... npm run load-test -- https://demo.example.com --email traveler@example.com --generate
//
// The account must be a confirmed Traveler that already has a Trip with a Plan. The password is read from the environment, never
// from the command line, so it stays out of shell history and process listings. With --generate it also creates a 7-Day Trip,
// asks for its Plan (a real AI request, so the host needs its real AI key) and deletes the Trip again.
import { z } from 'zod';
import { ordinaryPagesJourney, refusalForTarget, signIn } from './load-journey';
import { percentile, runUsers, summarise } from './load-runner';

const AGREED_P95_MS = 2_000;
const AGREED_SEVEN_DAY_PLAN_MS = 60_000;
const AGREED_ANY_PLAN_MS = 120_000;
const DEFAULT_USERS = 25;
const DEFAULT_ROUNDS = 10;
const TRIP_STARTS_IN_DAYS = 14;
const SEVEN_DAY_TRIP_LAST_DAY_OFFSET = 6;

const options = z.object({
  baseUrl: z.string(),
  email: z.email(),
  password: z.string().min(1, 'LOAD_TEST_PASSWORD must be set'),
  users: z.coerce.number().int().min(1).max(200),
  rounds: z.coerce.number().int().min(1).max(1_000),
  generate: z.boolean(),
});

const destinationsSchema = z.object({ destinations: z.array(z.object({ id: z.string() })) });
const createdTripSchema = z.object({ id: z.string() });

function argumentAfter(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

const line = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
const seconds = (ms: number): string => `${(ms / 1_000).toFixed(2)} s`;

/** A date `daysFromNow` days ahead, as YYYY-MM-DD. */
const dateAhead = (daysFromNow: number): string => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

function readOptions() {
  const parsed = options.safeParse({
    baseUrl: process.argv[2]?.replace(/\/+$/, '') ?? '',
    email: argumentAfter('--email'),
    password: process.env.LOAD_TEST_PASSWORD ?? '',
    users: argumentAfter('--users') ?? DEFAULT_USERS,
    rounds: argumentAfter('--rounds') ?? DEFAULT_ROUNDS,
    generate: process.argv.includes('--generate'),
  });
  const problems = parsed.success
    ? [refusalForTarget(parsed.data.baseUrl)].flatMap((refusal) => (refusal ? [`  address: ${refusal}`] : []))
    : parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  if (!parsed.success || problems.length > 0) {
    process.stderr.write(`Usage: LOAD_TEST_PASSWORD=... npm run load-test -- <https-address> --email <email> [--users 25] [--rounds 10] [--generate]\n${problems.join('\n')}\n`);
    process.exit(2);
  }
  return parsed.data;
}

const { baseUrl, email, password, users, rounds, generate } = readOptions();

async function measurePages(cookie: string): Promise<boolean> {
  line(`${users} users, ${rounds} rounds each, at ${new URL(baseUrl).host}`);
  const samples = await runUsers(users, () => ordinaryPagesJourney(baseUrl, cookie, { rounds }));
  const summary = summarise(samples);
  const median = percentile(samples.map((sample) => sample.ms), 50);
  const [firstFailure] = summary.failures;
  line(`  requests   ${summary.requests}`);
  line(`  failures   ${summary.failures.length}${firstFailure ? ` (first: ${firstFailure.name}, ${firstFailure.reason ?? `status ${firstFailure.status ?? 'none'}`})` : ''}`);
  line(`  median     ${seconds(median)}`);
  line(`  95th pct   ${seconds(summary.p95Ms)}   (agreed: under ${seconds(AGREED_P95_MS)})`);
  line(`  slowest    ${seconds(summary.slowest.ms)}   ${summary.slowest.name}`);
  const passed = summary.failures.length === 0 && summary.p95Ms < AGREED_P95_MS;
  line(passed ? 'PASS  ordinary pages' : 'FAIL  ordinary pages');
  return passed;
}

async function measureGeneration(cookie: string): Promise<boolean> {
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };
  const destinations = destinationsSchema.parse(await (await fetch(`${baseUrl}/api/destinations`, { headers })).json());
  const destinationId = destinations.destinations[0]?.id;
  if (!destinationId) throw new Error('The host has no Destination to plan a Trip to.');
  const created = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Load test 7-Day Trip',
      destinationId,
      startDate: dateAhead(TRIP_STARTS_IN_DAYS),
      endDate: dateAhead(TRIP_STARTS_IN_DAYS + SEVEN_DAY_TRIP_LAST_DAY_OFFSET),
      adults: 2,
      budget: 3000,
      currency: 'USD',
    }),
  });
  if (created.status !== 201) throw new Error(`Could not create the 7-Day Trip (status ${created.status}).`);
  const tripPath = `${baseUrl}/api/trips/${encodeURIComponent(createdTripSchema.parse(await created.json()).id)}`;
  try {
    const startedAt = performance.now();
    const generated = await fetch(`${tripPath}/plan`, { method: 'POST', headers });
    const tookMs = performance.now() - startedAt;
    await generated.arrayBuffer();
    line(`7-Day Plan: status ${generated.status} after ${seconds(tookMs)}   (agreed: within ${seconds(AGREED_SEVEN_DAY_PLAN_MS)}; any Plan within ${seconds(AGREED_ANY_PLAN_MS)})`);
    const passed = generated.status === 201 && tookMs <= AGREED_SEVEN_DAY_PLAN_MS;
    line(passed ? 'PASS  7-Day Plan' : 'FAIL  7-Day Plan');
    return passed;
  } finally {
    const removed = await fetch(tripPath, { method: 'DELETE', headers });
    if (!removed.ok) line(`Could not delete the load test Trip (status ${removed.status}); delete "Load test 7-Day Trip" by hand.`);
  }
}

async function main(): Promise<void> {
  const { cookie, sample } = await signIn(baseUrl, { email, password });
  line(`Signed in in ${seconds(sample.ms)}`);
  const results = [await measurePages(cookie)];
  if (generate) results.push(await measureGeneration(cookie));
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
});
