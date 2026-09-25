// What a user does in the load test: signs in once, then opens the ordinary pages (REQ-TRV-080). Never Plan generation,
// regeneration or chat, which wait on the AI and have times of their own.
import { z } from 'zod';
import { timed, type Sample } from './load-runner';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

const SESSION_COOKIE = 'trv_session';
const SHELL_ASSET = /(?:src|href)="(\/[^"]+\.(?:js|css))"/g;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why an address must not be tested, or null. A password and a session are sent to it, so it must be protected or be this machine. */
export function refusalForTarget(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return `"${address}" is not an address. Give one like https://your-host.`;
  }
  if (url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) return null;
  return 'Use an https:// address: the password and the session would otherwise cross the network unprotected. Only localhost may use http://.';
}

const cookieOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0] ?? '')
    .filter((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    .join('; ');

/** Signs in once, timed. Every user then shares the session: the limit on sign-ins per address would refuse 25 sign-ins from one machine. */
export async function signIn(baseUrl: string, credentials: Credentials): Promise<{ readonly cookie: string; readonly sample: Sample }> {
  let cookie = '';
  const sample = await timed('POST /api/sessions', async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      // A redirect would send the password on to wherever it points.
      redirect: 'manual',
    });
    cookie = cookieOf(response);
    await response.arrayBuffer();
    return response;
  });
  if (!sample.ok || cookie === '') throw new Error(`Could not sign in as ${credentials.email} (status ${sample.status ?? 'none'}).`);
  return { cookie, sample };
}

interface Page {
  readonly sample: Sample;
  readonly body: string;
}

async function open(baseUrl: string, cookie: string, path: string): Promise<Page> {
  let body = '';
  const sample = await timed(`GET ${path}`, async () => {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
    body = await response.text();
    return response;
  });
  return { sample, body };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const tripsSchema = z.object({ trips: z.array(z.object({ id: z.string() })) });

function firstTripId(body: string): string | undefined {
  try {
    return tripsSchema.parse(JSON.parse(body)).trips[0]?.id;
  } catch {
    return undefined;
  }
}

/**
 * One user opening the ordinary pages, `rounds` times over: the page the application is served as and the script and stylesheet it
 * names, then the reads behind the screens (Destinations, Trips, one Trip, its Plan and its budget).
 */
export async function ordinaryPagesJourney(
  baseUrl: string,
  cookie: string,
  options: { readonly rounds?: number; readonly thinkMs?: number } = {},
): Promise<Sample[]> {
  const { rounds = 5, thinkMs = 50 } = options;
  const samples: Sample[] = [];
  let tripId: string | undefined;
  for (let round = 0; round < rounds; round += 1) {
    const shell = await open(baseUrl, cookie, '/');
    samples.push(shell.sample);
    for (const [, asset] of shell.body.matchAll(SHELL_ASSET)) if (asset) samples.push((await open(baseUrl, cookie, asset)).sample);

    samples.push((await open(baseUrl, cookie, '/api/destinations')).sample);
    const trips = await open(baseUrl, cookie, '/api/trips');
    samples.push(trips.sample);
    tripId ??= firstTripId(trips.body);
    if (tripId) {
      for (const path of [`/api/trips/${tripId}`, `/api/trips/${tripId}/plan`, `/api/trips/${tripId}/budget`]) {
        samples.push((await open(baseUrl, cookie, path)).sample);
      }
    }
    await sleep(thinkMs);
  }
  return samples;
}
