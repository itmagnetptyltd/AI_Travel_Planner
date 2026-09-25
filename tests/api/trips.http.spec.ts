import { describe, expect, test } from 'vitest';
import { buildTestApp, type TestApp } from '../support/build-test-app';
import {
  aConfirmedTravelerSession,
  anAddedDestination,
  anAdministratorSession,
  aTripInput,
  aTripInputWithoutChildren,
  createdTrip,
  listedTrips,
  TODAY,
} from '../support/a-trip';

interface Ready {
  readonly testApp: TestApp;
  readonly cookies: Record<string, string>;
  readonly tokyoId: string;
}

async function aTravelerReadyToPlan(): Promise<Ready> {
  const testApp = await buildTestApp({ now: TODAY });
  const tokyoId = await anAddedDestination(testApp, { name: 'Tokyo', country: 'Japan' });
  const cookies = await aConfirmedTravelerSession(testApp);
  return { testApp, cookies, tokyoId };
}

async function postTrip(ready: Ready, payload: object) {
  return ready.testApp.app.inject({ method: 'POST', url: '/api/trips', cookies: ready.cookies, payload });
}

describe('POST /api/trips', () => {
  // @covers REQ-TRV-011@v2
  test('POST /api/trips returns 201, and GET /api/trips lists it with 4 travelers and status Draft', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId));

    expect(response.statusCode).toBe(201);
    expect(await listedTrips(ready.testApp.app, ready.cookies)).toEqual([
      expect.objectContaining({
        name: 'Tokyo Family Holiday',
        destination: { id: ready.tokyoId, name: 'Tokyo', country: 'Japan' },
        startDate: '2026-10-10',
        endDate: '2026-10-17',
        adults: 2,
        children: 2,
        numberOfTravelers: 4,
        budget: 5000,
        currency: 'USD',
        status: 'Draft',
      }),
    ]);
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with an unknown destinationId returns 400 naming destinationId', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput('atlantis'));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'destinationId' });
  });

  // @covers REQ-TRV-011@v2
  test('GET /api/destinations?q=Tok returns Tokyo and not Kyoto', async () => {
    const ready = await aTravelerReadyToPlan();
    await anAddedDestination(ready.testApp, { name: 'Kyoto' });

    const response = await ready.testApp.app.inject({ method: 'GET', url: '/api/destinations?q=Tok', cookies: ready.cookies });

    expect((response.json() as { destinations: { name: string }[] }).destinations.map((d) => d.name)).toEqual(['Tokyo']);
  });

  // @covers REQ-TRV-011@v2
  test.each(['name', 'destinationId', 'startDate', 'endDate', 'adults', 'budget', 'currency'] as const)(
    'POST /api/trips without %s returns 400 naming it',
    async (field) => {
      const ready = await aTravelerReadyToPlan();

      const response = await postTrip(ready, { ...aTripInput(ready.tokyoId), [field]: undefined });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ field });
    },
  );

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with adults 0 returns 400 naming adults', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { adults: 0 }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'adults' });
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips without children returns 201 with children 0 and travelStyles []', async () => {
    const ready = await aTravelerReadyToPlan();
    const response = await postTrip(ready, aTripInputWithoutChildren(ready.tokyoId));

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ children: 0, travelStyles: [] });
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with numberOfTravelers 5, 2 adults and 1 child reads back numberOfTravelers 3', async () => {
    const ready = await aTravelerReadyToPlan();
    const trip = await createdTrip(
      ready.testApp.app,
      ready.cookies,
      aTripInput(ready.tokyoId, { adults: 2, children: 1, numberOfTravelers: 5 }),
    );

    const response = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${trip.id}`, cookies: ready.cookies });

    expect(response.json()).toMatchObject({ numberOfTravelers: 3 });
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with currency CAD returns 400 naming currency', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, { ...aTripInput(ready.tokyoId), currency: 'CAD' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'currency' });
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with travelStyles [Adventure] leaves GET /api/profile at Family', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    await app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload: { defaultTravelStyle: 'Family' } });

    const trip = await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId, { travelStyles: ['Adventure'] }));
    const profile = await app.inject({ method: 'GET', url: '/api/profile', cookies: ready.cookies });

    expect(trip.travelStyles).toEqual(['Adventure']);
    expect(profile.json()).toMatchObject({ defaultTravelStyle: 'Family' });
  });

  // @covers REQ-TRV-011@v2
  test('POST /api/trips with an unknown extra field returns 400', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, { ...aTripInput(ready.tokyoId), ownerAccountId: 'someone-else' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'ownerAccountId' });
  });
});

describe('Trip dates', () => {
  // @covers REQ-TRV-012@v2
  test('POST /api/trips ending before it starts returns 400 naming endDate', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { startDate: '2026-10-17', endDate: '2026-10-10' }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'endDate' });
  });

  // @covers REQ-TRV-012@v2
  test('POST /api/trips for 2026-10-01 to 2026-10-14 returns 201', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { startDate: '2026-10-01', endDate: '2026-10-14' }));

    expect(response.statusCode).toBe(201);
  });

  // @covers REQ-TRV-012@v2
  test('POST /api/trips for 2026-10-01 to 2026-10-15 returns 400 naming endDate', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { startDate: '2026-10-01', endDate: '2026-10-15' }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'endDate' });
  });

  // @covers REQ-TRV-012@v2
  test('POST /api/trips starting 2026-09-22 returns 400 naming startDate', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { startDate: '2026-09-22', endDate: '2026-09-25' }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'startDate' });
  });

  // @covers REQ-TRV-012@v2
  test('POST /api/trips for 2026-09-23 to 2026-09-23 returns 201 as a 1-Day Trip', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { startDate: '2026-09-23', endDate: '2026-09-23' }));

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ dayCount: 1 });
  });

  // @covers REQ-TRV-012@v2
  test('PATCH startDate 2026-09-20 returns 400 naming startDate, and GET still shows 2026-10-10', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    const trip = await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId, { startDate: '2026-10-10' }));

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/trips/${trip.id}`,
      cookies: ready.cookies,
      payload: { startDate: '2026-09-20' },
    });
    const after = await app.inject({ method: 'GET', url: `/api/trips/${trip.id}`, cookies: ready.cookies });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'startDate' });
    expect(after.json()).toMatchObject({ startDate: '2026-10-10' });
  });
});

describe('budget', () => {
  // @covers REQ-TRV-013@v1
  test('POST /api/trips with budget -100 returns 400 naming budget', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await postTrip(ready, aTripInput(ready.tokyoId, { budget: -100 }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'budget' });
  });
});

describe('editing, deleting and listing Trips', () => {
  // @covers REQ-TRV-014@v2
  test('PATCH name Tokyo Autumn, then GET /api/trips lists Tokyo Autumn', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    const trip = await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId));

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/trips/${trip.id}`,
      cookies: ready.cookies,
      payload: { name: 'Tokyo Autumn' },
    });

    expect(response.statusCode).toBe(200);
    expect((await listedTrips(app, ready.cookies)).map((t) => t.name)).toEqual(['Tokyo Autumn']);
  });

  // @covers REQ-TRV-015@v2
  test('DELETE /api/trips/:id returns 204 and GET /api/trips no longer lists it', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    const trip = await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId));

    const response = await app.inject({ method: 'DELETE', url: `/api/trips/${trip.id}`, cookies: ready.cookies });

    expect(response.statusCode).toBe(204);
    expect(await listedTrips(app, ready.cookies)).toEqual([]);
  });

  // @covers REQ-TRV-016@v1
  test('GET /api/trips lists both of the Traveler Trips by name', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId, { name: 'Tokyo Family Holiday' }));
    await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId, { name: 'Tokyo Autumn' }));

    expect((await listedTrips(app, ready.cookies)).map((t) => t.name)).toEqual(['Tokyo Autumn', 'Tokyo Family Holiday']);
  });
});

describe('the Trip Destination', () => {
  // @covers REQ-TRV-093@v1
  test('POST /api/trips for a disabled Destination returns 400 naming destinationId', async () => {
    const ready = await aTravelerReadyToPlan();
    const kyotoId = await anAddedDestination(ready.testApp, { name: 'Kyoto' });
    await ready.testApp.app.inject({
      method: 'POST',
      url: `/api/admin/destinations/${kyotoId}/disable`,
      cookies: await anAdministratorSession(ready.testApp),
    });

    const response = await postTrip(ready, aTripInput(kyotoId));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'destinationId' });
  });

  // @covers REQ-TRV-093@v1
  test('GET /api/trips/:id carries destination Kyoto with country Japan', async () => {
    const ready = await aTravelerReadyToPlan();
    const kyotoId = await anAddedDestination(ready.testApp, { name: 'Kyoto', country: 'Japan' });
    const trip = await createdTrip(ready.testApp.app, ready.cookies, aTripInput(kyotoId));

    const response = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${trip.id}`, cookies: ready.cookies });

    expect(response.json()).toMatchObject({ destination: { id: kyotoId, name: 'Kyoto', country: 'Japan' } });
  });
});

describe('removing a Destination a Trip uses', () => {
  // @covers REQ-TRV-095@v1
  test('DELETE /api/admin/destinations/:id for a Destination used by a Trip returns 409, and it is still listed', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app } = ready.testApp;
    await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId));
    const adminCookies = await anAdministratorSession(ready.testApp);

    const response = await app.inject({ method: 'DELETE', url: `/api/admin/destinations/${ready.tokyoId}`, cookies: adminCookies });
    const listed = await app.inject({ method: 'GET', url: '/api/admin/destinations', cookies: adminCookies });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'DESTINATION_IN_USE' });
    expect((listed.json() as { destinations: { name: string }[] }).destinations.map((d) => d.name)).toEqual(['Tokyo']);
    expect(await listedTrips(app, ready.cookies)).toHaveLength(1);
  });

  // @covers REQ-TRV-095@v1
  test('DELETE /api/admin/destinations/:id for a Destination used only by a deleted Trip returns 409', async () => {
    const ready = await aTravelerReadyToPlan();
    const { app, clock } = ready.testApp;
    const trip = await createdTrip(app, ready.cookies, aTripInput(ready.tokyoId));
    await app.inject({ method: 'DELETE', url: `/api/trips/${trip.id}`, cookies: ready.cookies });
    clock.advanceBy(5 * 24 * 60 * 60 * 1000);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/destinations/${ready.tokyoId}`,
      cookies: await anAdministratorSession(ready.testApp),
    });

    expect(response.statusCode).toBe(409);
  });
});
