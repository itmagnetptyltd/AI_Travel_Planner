import type { LightMyRequestResponse } from 'fastify';
import { describe, expect, test } from 'vitest';
import type { TripInput, TripView } from '../../src/shared/trip-schemas';
import { buildTestApp, type TestApp } from '../support/build-test-app';
import { aConfirmedTravelerSession, anAddedDestination, aTripInput, createdTrip, TODAY } from '../support/a-trip';

type DestinationName = 'Tokyo' | 'Kyoto' | 'Paris';

interface Rig {
  readonly testApp: TestApp;
  readonly cookies: Record<string, string>;
  readonly destinations: Readonly<Record<DestinationName, string>>;
  readonly add: (destination: DestinationName, overrides: Partial<TripInput>) => Promise<TripView>;
  readonly search: (query: string, cookies?: Record<string, string>) => Promise<LightMyRequestResponse>;
}

async function aTravelerWithDestinations(): Promise<Rig> {
  const testApp = await buildTestApp({ now: TODAY });
  const destinations: Record<DestinationName, string> = {
    Tokyo: await anAddedDestination(testApp, { name: 'Tokyo', country: 'Japan' }),
    Kyoto: await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' }),
    Paris: await anAddedDestination(testApp, { name: 'Paris', country: 'France' }),
  };
  const cookies = await aConfirmedTravelerSession(testApp);
  return {
    testApp,
    cookies,
    destinations,
    add: (destination, overrides) => createdTrip(testApp.app, cookies, aTripInput(destinations[destination], overrides)),
    search: (query, using = cookies) => testApp.app.inject({ method: 'GET', url: `/api/trips${query}`, cookies: using }),
  };
}

const namesIn = (response: { json(): unknown }): string[] => (response.json() as { trips: TripView[] }).trips.map((trip) => trip.name);

describe('GET /api/trips with a search', () => {
  // @covers REQ-TRV-076@v1
  test('returns only "Tokyo Family Holiday" when searching for "Tokyo"', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Tokyo Family Holiday' });
    await rig.add('Paris', { name: 'Paris Weekend' });

    const response = await rig.search('?search=Tokyo');

    expect(response.statusCode).toBe(200);
    expect(namesIn(response)).toEqual(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-076@v1
  test('returns every Trip, as before, when no search or filter is sent', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Tokyo Family Holiday' });
    await rig.add('Paris', { name: 'Paris Weekend' });

    expect(namesIn(await rig.search(''))).toEqual(['Paris Weekend', 'Tokyo Family Holiday']);
    expect(namesIn(await rig.search('?search='))).toEqual(['Paris Weekend', 'Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-077@v1
  test('treats every parameter sent blank as not sent', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Tokyo Family Holiday' });
    await rig.add('Paris', { name: 'Paris Weekend' });

    const response = await rig.search('?search=&destination=&country=&style=&currency=&minBudget=&maxBudget=&minDays=&maxDays=');

    expect(response.statusCode).toBe(200);
    expect(namesIn(response)).toEqual(['Paris Weekend', 'Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-076@v1
  test('finds a Trip by its Destination, and ignores capitals and the spaces around the search', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Kyoto', { name: 'Family Holiday' });
    await rig.add('Paris', { name: 'Paris Weekend' });

    expect(namesIn(await rig.search('?search=%20KYOTO%20'))).toEqual(['Family Holiday']);
    expect(namesIn(await rig.search('?search=france'))).toEqual(['Paris Weekend']);
  });
});

describe('GET /api/trips with filters', () => {
  // @covers REQ-TRV-077@v1
  test('returns only the Family Trip when the travel style is Family', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Family Trip', travelStyles: ['Family'] });
    await rig.add('Tokyo', { name: 'Business Trip', travelStyles: ['Business'] });

    expect(namesIn(await rig.search('?style=Family'))).toEqual(['Family Trip']);
  });

  // @covers REQ-TRV-077@v1
  test('returns only the 8-Day Trip when the Trip is to be longer than 5 Days', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Three days', startDate: '2026-10-10', endDate: '2026-10-12' });
    await rig.add('Tokyo', { name: 'Eight days', startDate: '2026-10-10', endDate: '2026-10-17' });

    expect(namesIn(await rig.search('?minDays=6'))).toEqual(['Eight days']);
    expect(namesIn(await rig.search('?maxDays=3'))).toEqual(['Three days']);
  });

  // @covers REQ-TRV-077@v1
  test('returns only the Kyoto Trip when the country is Japan', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Kyoto', { name: 'Kyoto trip' });
    await rig.add('Paris', { name: 'Paris trip' });

    expect(namesIn(await rig.search('?country=Japan'))).toEqual(['Kyoto trip']);
  });

  // @covers REQ-TRV-077@v1
  test('filters by Destination, and by a budget range in one currency', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Cheap dollars', budget: 1000, currency: 'USD' });
    await rig.add('Tokyo', { name: 'Dear dollars', budget: 9000, currency: 'USD' });
    await rig.add('Kyoto', { name: 'Yen', budget: 3000, currency: 'JPY' });

    expect(namesIn(await rig.search(`?destination=${rig.destinations.Kyoto}`))).toEqual(['Yen']);
    expect(namesIn(await rig.search('?currency=USD&minBudget=500&maxBudget=2000'))).toEqual(['Cheap dollars']);
    expect(namesIn(await rig.search('?currency=USD'))).toEqual(['Cheap dollars', 'Dear dollars']);
  });

  // @covers REQ-TRV-077@v1
  test('returns only a Trip that meets every filter sent', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Match', travelStyles: ['Family'], startDate: '2026-10-10', endDate: '2026-10-17' });
    await rig.add('Tokyo', { name: 'Too short', travelStyles: ['Family'], startDate: '2026-10-10', endDate: '2026-10-11' });
    await rig.add('Paris', { name: 'Elsewhere', travelStyles: ['Family'], startDate: '2026-10-10', endDate: '2026-10-17' });

    expect(namesIn(await rig.search('?style=Family&minDays=6&country=Japan&search=match'))).toEqual(['Match']);
  });

  // @covers REQ-TRV-077@v1
  test('returns an empty list, not an error, when nothing matches', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: 'Tokyo trip' });

    const response = await rig.search('?style=Luxury');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trips: [] });
  });
});

describe('whose Trips a search can reach', () => {
  // @covers REQ-TRV-007@v2
  test("never returns another Traveler's Trip or a deleted Trip, whatever is asked for", async () => {
    const rig = await aTravelerWithDestinations();
    const other = await aConfirmedTravelerSession(rig.testApp, 'other@example.com');
    await rig.add('Tokyo', { name: 'Tokyo mine' });
    await createdTrip(rig.testApp.app, other, aTripInput(rig.destinations.Tokyo, { name: 'Tokyo theirs' }));
    const deleted = await rig.add('Tokyo', { name: 'Tokyo deleted' });
    await rig.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${deleted.id}`, cookies: rig.cookies });

    expect(namesIn(await rig.search('?search=Tokyo'))).toEqual(['Tokyo mine']);
    expect(namesIn(await rig.search('?country=Japan'))).toEqual(['Tokyo mine']);
    expect(namesIn(await rig.search('', other))).toEqual(['Tokyo theirs']);
  });

  // @covers REQ-TRV-007@v2
  test('is not a way into anything but the list: an id or an owner in the query is refused', async () => {
    const rig = await aTravelerWithDestinations();

    for (const query of ['?owner=someone', '?ownerAccountId=someone', '?id=1']) {
      const response = await rig.search(query);
      expect(response.statusCode).toBe(400);
    }
  });

  test('answers 401 to a caller who is not logged in', async () => {
    const rig = await aTravelerWithDestinations();

    expect((await rig.search('?search=Tokyo', {})).statusCode).toBe(401);
  });
});

describe('a search or filter that cannot be read', () => {
  // @covers REQ-TRV-077@v1
  test.each([
    ['a fraction of a Day', '?minDays=2.5', 'minDays'],
    ['a negative number', '?maxDays=-1', 'maxDays'],
    ['words for a number', '?currency=USD&minBudget=lots', 'minBudget'],
    ['a travel style that does not exist', '?style=Sightseeing', 'style'],
    ['a budget range with no currency', '?minBudget=100', 'currency'],
    ['a budget minimum above the maximum', '?currency=USD&minBudget=500&maxBudget=100', 'maxBudget'],
    ['a Day minimum above the maximum', '?minDays=9&maxDays=3', 'maxDays'],
    ['a search over 100 characters', `?search=${'x'.repeat(101)}`, 'search'],
    ['a parameter that is not a filter', '?colour=red', 'colour'],
    ['the same filter twice', '?style=Family&style=Business', 'style'],
  ])('answers 400 naming the field for %s', async (_name, query, field) => {
    const rig = await aTravelerWithDestinations();

    const response = await rig.search(query);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field });
  });

  // @covers REQ-TRV-076@v1
  test('treats text that looks like a database pattern as plain text, and never as SQL', async () => {
    const rig = await aTravelerWithDestinations();
    await rig.add('Tokyo', { name: "Tokyo'); DROP TABLE trips;--" });

    expect(namesIn(await rig.search(`?search=${encodeURIComponent("'); DROP TABLE trips;--")}`))).toEqual(["Tokyo'); DROP TABLE trips;--"]);
    expect(namesIn(await rig.search('?search=%25'))).toEqual([]);
    expect(namesIn(await rig.search(''))).toHaveLength(1);
  });
});
