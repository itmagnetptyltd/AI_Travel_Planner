import { describe, expect, test } from 'vitest';
import { openSharedLink } from '../support/a-share-api';
import { aWebRoot } from '../support/a-web-root';
import { twoTravelers, X_PROFILE, Y_PROFILE, type TwoTravelers } from '../support/two-travelers';

type Cookies = Record<string, string>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface Ask {
  readonly method: Method;
  readonly url: string;
  readonly payload?: object;
}

/** Every address a Traveler's profile could plausibly be asked for at, by an identifier: where a route for it would most likely be added. */
const byIdentifier = (identifier: string): string[] => [
  `/api/profile/${identifier}`,
  `/api/profile/${identifier}/`,
  `/api/profiles/${identifier}`,
  `/api/accounts/${identifier}`,
  `/api/accounts/${identifier}/profile`,
  `/api/account/${identifier}`,
  `/api/user/${identifier}`,
  `/api/users/${identifier}`,
  `/api/users/${identifier}/profile`,
  `/api/travelers/${identifier}`,
  `/api/travelers/${identifier}/profile`,
  `/api/members/${identifier}`,
  `/api/me/${identifier}`,
  `/api/v1/profile/${identifier}`,
  `/api/profile/../accounts/${identifier}`,
];

/** Asking for a profile with the identifier in a query string, on a collection, or in a request body. */
const otherWays = (id: string, email: string): Ask[] => [
  { method: 'GET', url: `/api/profiles?id=${id}` },
  { method: 'GET', url: `/api/profiles?email=${encodeURIComponent(email)}` },
  { method: 'GET', url: `/api/users?id=${id}` },
  { method: 'GET', url: `/api/users?email=${encodeURIComponent(email)}` },
  { method: 'GET', url: `/api/profile/lookup?id=${id}` },
  { method: 'GET', url: `/api/profile/search?q=${encodeURIComponent(email)}` },
  { method: 'POST', url: '/api/profile/lookup', payload: { id } },
  { method: 'POST', url: '/api/profile/search', payload: { email } },
  { method: 'POST', url: '/api/profiles', payload: { id } },
  { method: 'POST', url: '/api/graphql', payload: { query: `{ profile(id: "${id}") { displayName email } }` } },
];

const NOT_FOUND = { code: 'NOT_FOUND' };

/** Everything a response gives a caller, as text: its status, its headers and its body. */
const everythingIn = (response: { statusCode: number; headers: unknown; body: string }): string => `${response.statusCode}\n${JSON.stringify(response.headers)}\n${response.body}`;

const send = (both: TwoTravelers, ask: Ask, cookies: Cookies | null = both.y.cookies) =>
  both.ready.testApp.app.inject({ method: ask.method, url: ask.url, ...(cookies ? { cookies } : {}), ...(ask.payload ? { payload: ask.payload } : {}) });

const get = (url: string): Ask => ({ method: 'GET', url });

/** The requests that were not answered with a plain 404, so a failure names them all and not only the first. */
async function notAnsweredWithNotFound(both: TwoTravelers, asks: readonly Ask[], cookies: Cookies | null = both.y.cookies): Promise<string[]> {
  const wrong: string[] = [];
  for (const ask of asks) {
    const response = await send(both, ask, cookies);
    if (response.statusCode !== 404 || response.body !== JSON.stringify(NOT_FOUND)) wrong.push(`${ask.method} ${ask.url}: ${response.statusCode} ${response.body.slice(0, 80)}`);
  }
  return wrong;
}

/** The requests whose answers hold any of `values`. */
async function leaking(both: TwoTravelers, asks: readonly Ask[], values: readonly string[], cookies: Cookies | null = both.y.cookies): Promise<string[]> {
  const leaks: string[] = [];
  for (const ask of asks) {
    const text = everythingIn(await send(both, ask, cookies));
    for (const value of values) if (text.includes(value)) leaks.push(`${ask.method} ${ask.url} holds ${value}`);
  }
  return leaks;
}

describe('a Traveler asking for another Traveler’s profile by its identifier', () => {
  // @covers REQ-TRV-008@v1
  test('is told 404 at every address it could be asked for at, with nothing in the answer but that it is not found', async () => {
    const both = await twoTravelers();

    expect(await notAnsweredWithNotFound(both, byIdentifier(both.x.id).map(get))).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('is told 404 when the identifier is in a query string, on a collection or in a request body', async () => {
    const both = await twoTravelers();

    expect(await notAnsweredWithNotFound(both, otherWays(both.x.id, both.x.email))).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('is given none of the other Traveler’s profile, their name, their email address or their identifier, in the body or the headers of any answer', async () => {
    const both = await twoTravelers();

    expect(await leaking(both, [...byIdentifier(both.x.id).map(get), ...otherWays(both.x.id, both.x.email)], both.valuesOfX)).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('is told the same whether the identifier is the other Traveler’s id, their email address or nobody’s, so a 404 cannot be used to find out who has an account', async () => {
    const both = await twoTravelers();
    const answersFor = async (identifier: string) =>
      Promise.all(byIdentifier(identifier).map(async (url) => {
        const response = await send(both, get(url));
        return [response.statusCode, response.headers['content-type'], response.body];
      }));

    const forX = await answersFor(both.x.id);

    expect(await answersFor(encodeURIComponent(both.x.email))).toEqual(forX);
    expect(await answersFor('00000000-0000-4000-8000-000000000000')).toEqual(forX);
  });

  // @covers REQ-TRV-008@v1
  test('is told 404, and not sent the page instead, with the built web app being served too', async () => {
    const both = await twoTravelers({ webRoot: await aWebRoot() });

    expect(await notAnsweredWithNotFound(both, [...byIdentifier(both.x.id).map(get), ...otherWays(both.x.id, both.x.email)])).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('is told 404 by someone who is not logged in as well, with none of the profile', async () => {
    const both = await twoTravelers();
    const asks = [...byIdentifier(both.x.id).map(get), ...otherWays(both.x.id, both.x.email)];

    expect(await notAnsweredWithNotFound(both, asks, null)).toEqual([]);
    expect(await leaking(both, asks, both.valuesOfX, null)).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('gets their own profile, and only that, however the other Traveler is named in the request for it', async () => {
    const both = await twoTravelers();
    const queries = [`?id=${both.x.id}`, `?accountId=${both.x.id}`, `?email=${encodeURIComponent(both.x.email)}`, `?userId=${both.x.id}&id=${both.x.id}`];
    const asks = queries.map((query) => get(`/api/profile${query}`));

    const answers = await Promise.all(asks.map((ask) => send(both, ask)));

    expect(answers.map((response) => response.statusCode)).toEqual(asks.map(() => 200));
    for (const response of answers) expect(response.json()).toMatchObject({ displayName: Y_PROFILE.displayName, preferredCurrency: Y_PROFILE.preferredCurrency });
    expect(await leaking(both, asks, both.valuesOfX)).toEqual([]);
  });
});

describe('a Traveler trying to change another Traveler’s profile', () => {
  const profileOfX = async (both: TwoTravelers) => (await send(both, get('/api/profile'), both.x.cookies)).json();

  // @covers REQ-TRV-008@v1
  test('is refused when it names the other Traveler in the update, and their profile is as it was', async () => {
    const both = await twoTravelers();

    const response = await send(both, { method: 'PATCH', url: '/api/profile', payload: { id: both.x.id, displayName: 'Vandalised' } });

    expect(response.statusCode).toBe(400);
    expect(await profileOfX(both)).toMatchObject({ displayName: X_PROFILE.displayName, preferredCurrency: X_PROFILE.preferredCurrency, defaultTravelStyle: X_PROFILE.defaultTravelStyle, foodPreference: X_PROFILE.foodPreference });
  });

  // @covers REQ-TRV-008@v1
  test('changes only their own profile when it names the other Traveler in headers, and the other Traveler’s is as it was', async () => {
    const both = await twoTravelers();

    const response = await both.ready.testApp.app.inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies: both.y.cookies,
      headers: { 'x-account-id': both.x.id, 'x-user-id': both.x.id, 'x-forwarded-user': both.x.email },
      payload: { displayName: 'Also Yolanda' },
    });

    expect(response.json()).toMatchObject({ displayName: 'Also Yolanda' });
    expect(await profileOfX(both)).toMatchObject({ displayName: X_PROFILE.displayName });
  });

  // @covers REQ-TRV-008@v1
  test('has no address to change it at by their identifier: each is 404, and the other Traveler’s profile is as it was', async () => {
    const both = await twoTravelers();
    const asks = byIdentifier(both.x.id).flatMap((url): Ask[] => (['PUT', 'PATCH', 'DELETE'] as const).map((method) => ({ method, url, payload: { displayName: 'Vandalised' } })));

    expect(await notAnsweredWithNotFound(both, asks)).toEqual([]);
    expect(await profileOfX(both)).toMatchObject({ displayName: X_PROFILE.displayName });
  });
});

describe('what a Traveler is sent while another Traveler has a profile, a Trip and a shared Plan', () => {
  // @covers REQ-TRV-008@v1
  test('gives each Traveler their own profile, and they differ, so the guard is not passing because profiles cannot be read', async () => {
    const both = await twoTravelers();

    const own = (await send(both, get('/api/profile'), both.x.cookies)).json();
    const theirs = (await send(both, get('/api/profile'))).json();

    expect(own).toMatchObject({ displayName: X_PROFILE.displayName, preferredCurrency: X_PROFILE.preferredCurrency, defaultTravelStyle: X_PROFILE.defaultTravelStyle, foodPreference: X_PROFILE.foodPreference });
    expect(theirs).toMatchObject({ displayName: Y_PROFILE.displayName, preferredCurrency: Y_PROFILE.preferredCurrency, defaultTravelStyle: Y_PROFILE.defaultTravelStyle, foodPreference: Y_PROFILE.foodPreference });
    expect(theirs).not.toEqual(own);
  });

  // @covers REQ-TRV-008@v1
  test('holds nothing of the other Traveler’s profile in any Traveler-facing answer, including those for their Trip’s own addresses', async () => {
    const both = await twoTravelers();
    const trip = `/api/trips/${both.x.tripId}`;
    const addresses = ['/api/trips', '/api/trips/deleted', '/api/destinations', '/api/profile', '/api/sessions/current', trip, `${trip}/plan`, `${trip}/plan/versions`, `${trip}/budget`, `${trip}/chat`, `${trip}/feedback`, `${trip}/shares`];

    const answers = await Promise.all(addresses.map(async (url) => ({ url, status: (await send(both, get(url))).statusCode })));

    expect(answers.filter(({ status }) => status >= 500)).toEqual([]);
    expect(await leaking(both, addresses.map(get), both.valuesOfX)).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('holds nothing of the other Traveler’s profile in the public view of a Plan they shared, whoever opens it', async () => {
    const both = await twoTravelers();

    const seenByY = await both.ready.testApp.app.inject({ method: 'GET', url: `/api/shared/${both.sharedToken}`, cookies: both.y.cookies });
    const seenByAnyone = await openSharedLink(both.ready, both.sharedToken);

    expect([seenByY.statusCode, seenByAnyone.statusCode]).toEqual([200, 200]);
    expect([seenByY, seenByAnyone].flatMap((response) => both.valuesOfX.filter((value) => everythingIn(response).includes(value)))).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  test('is refused, with none of the other Traveler’s fields, at the one route that reads an account by identifier, which is for Administrators only', async () => {
    const both = await twoTravelers();

    const response = await send(both, get(`/api/admin/accounts/${both.x.id}`));

    expect([403, 404]).toContain(response.statusCode);
    expect(await leaking(both, [get(`/api/admin/accounts/${both.x.id}`)], both.valuesOfX)).toEqual([]);
  });
});
