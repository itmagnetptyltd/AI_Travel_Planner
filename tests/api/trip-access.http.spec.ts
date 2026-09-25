import { describe, expect, test } from 'vitest';
import { buildTestApp, type TestApp } from '../support/build-test-app';
import { aConfirmedTravelerSession, anAddedDestination, aTripInput, createdTrip, listedTrips, TODAY } from '../support/a-trip';
import type { TripView } from '../../src/shared/trip-schemas';

interface TwoTravelers {
  readonly testApp: TestApp;
  readonly x: Record<string, string>;
  readonly y: Record<string, string>;
  readonly xTrip: TripView;
}

async function xOwnsATripAndYIsLoggedIn(): Promise<TwoTravelers> {
  const testApp = await buildTestApp({ now: TODAY });
  const tokyoId = await anAddedDestination(testApp, { name: 'Tokyo' });
  const x = await aConfirmedTravelerSession(testApp, 'x@example.com');
  const y = await aConfirmedTravelerSession(testApp, 'y@example.com');
  const xTrip = await createdTrip(testApp.app, x, aTripInput(tokyoId, { name: 'Tokyo Family Holiday' }));
  return { testApp, x, y, xTrip };
}

describe('a Trip that is not yours', () => {
  // @covers REQ-TRV-007@v2
  test('GET another Traveler Trip returns 404 with no Trip fields in the body', async () => {
    const { testApp, y, xTrip } = await xOwnsATripAndYIsLoggedIn();

    const response = await testApp.app.inject({ method: 'GET', url: `/api/trips/${xTrip.id}`, cookies: y });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
  });

  // @covers REQ-TRV-007@v2
  test('PATCH another Traveler Trip returns 404 and the owner still sees it unchanged', async () => {
    const { testApp, x, y, xTrip } = await xOwnsATripAndYIsLoggedIn();

    const response = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/trips/${xTrip.id}`,
      cookies: y,
      payload: { name: 'Taken over' },
    });

    expect(response.statusCode).toBe(404);
    expect(await listedTrips(testApp.app, x)).toEqual([xTrip]);
  });

  // @covers REQ-TRV-007@v2
  test('DELETE another Traveler Trip returns 404 and the owner still has it', async () => {
    const { testApp, x, y, xTrip } = await xOwnsATripAndYIsLoggedIn();

    const response = await testApp.app.inject({ method: 'DELETE', url: `/api/trips/${xTrip.id}`, cookies: y });

    expect(response.statusCode).toBe(404);
    expect(await listedTrips(testApp.app, x)).toEqual([xTrip]);
  });

  // @covers REQ-TRV-007@v2
  test('GET /api/trips as Y lists none of X Trips', async () => {
    const { testApp, y } = await xOwnsATripAndYIsLoggedIn();

    expect(await listedTrips(testApp.app, y)).toEqual([]);
  });

  // @covers REQ-TRV-007@v2
  test('GET /api/trips/:id without a session returns 401', async () => {
    const { testApp, xTrip } = await xOwnsATripAndYIsLoggedIn();

    const response = await testApp.app.inject({ method: 'GET', url: `/api/trips/${xTrip.id}` });

    expect(response.statusCode).toBe(401);
  });
});
