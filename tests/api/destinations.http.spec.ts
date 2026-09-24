import type { FastifyInstance } from 'fastify';
import { describe, expect, test } from 'vitest';
import type { DestinationInput } from '../../src/shared/destination-schemas';
import { buildTestApp } from '../support/build-test-app';
import { aLoggedInTraveler } from '../support/a-traveler';
import { aLoggedInAdministrator } from '../support/an-administrator';
import { aDestination } from '../support/a-destination';

interface DestinationBody extends DestinationInput {
  readonly id: string;
  readonly isDisabled: boolean;
}

async function added(app: FastifyInstance, cookies: Record<string, string>, input: DestinationInput): Promise<DestinationBody> {
  const response = await app.inject({ method: 'POST', url: '/api/admin/destinations', cookies, payload: input });
  if (response.statusCode !== 201) throw new Error(`add failed with ${response.statusCode}`);
  return response.json() as DestinationBody;
}

async function adminList(app: FastifyInstance, cookies: Record<string, string>): Promise<DestinationBody[]> {
  const response = await app.inject({ method: 'GET', url: '/api/admin/destinations', cookies });
  return (response.json() as { destinations: DestinationBody[] }).destinations;
}

async function travelerSearch(app: FastifyInstance, cookies: Record<string, string>, query: string): Promise<string[]> {
  const response = await app.inject({ method: 'GET', url: `/api/destinations?q=${encodeURIComponent(query)}`, cookies });
  return (response.json() as { destinations: { name: string }[] }).destinations.map((d) => d.name);
}

describe('adding a Destination', () => {
  // @covers REQ-TRV-072@v2
  test('POST /api/admin/destinations then GET shows Kyoto with its four values', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);

    await added(app, cookies, aDestination());

    expect(await adminList(app, cookies)).toEqual([expect.objectContaining(aDestination())]);
  });

  // @covers REQ-TRV-072@v2
  test('GET /api/destinations/:id returns the four values to a Traveler', async () => {
    const { app, db } = await buildTestApp();
    const kyoto = await added(app, await aLoggedInAdministrator(app, db), aDestination());
    const { cookies } = await aLoggedInTraveler(app);

    const response = await app.inject({ method: 'GET', url: `/api/destinations/${kyoto.id}`, cookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      description: aDestination().description,
      popularActivities: aDestination().popularActivities,
      recommendedDurationDays: 3,
      travelInformation: aDestination().travelInformation,
    });
  });

  // @covers REQ-TRV-072@v2
  test('a Destination with a missing description returns 400 naming description', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/destinations',
      cookies,
      payload: { ...aDestination(), description: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'description' });
  });
});

describe('editing a Destination', () => {
  // @covers REQ-TRV-073@v1
  test('PATCH recommendedDurationDays 4 then GET shows 4 days', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);
    const kyoto = await added(app, cookies, aDestination({ recommendedDurationDays: 3 }));

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/admin/destinations/${kyoto.id}`,
      cookies,
      payload: { recommendedDurationDays: 4 },
    });

    expect(edited.statusCode).toBe(200);
    expect((await adminList(app, cookies))[0]?.recommendedDurationDays).toBe(4);
  });
});

describe('disabling a Destination', () => {
  // @covers REQ-TRV-074@v2
  test('after disable, a Traveler searching for Kyoto does not get Kyoto', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const kyoto = await added(app, adminCookies, aDestination());
    const { cookies } = await aLoggedInTraveler(app);

    await app.inject({ method: 'POST', url: `/api/admin/destinations/${kyoto.id}/disable`, cookies: adminCookies });

    expect(await travelerSearch(app, cookies, 'Kyoto')).toEqual([]);
  });

  // @covers REQ-TRV-074@v2
  test('after disable, the Administrator list shows Kyoto marked disabled', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);
    const kyoto = await added(app, cookies, aDestination());

    await app.inject({ method: 'POST', url: `/api/admin/destinations/${kyoto.id}/disable`, cookies });

    expect(await adminList(app, cookies)).toEqual([expect.objectContaining({ name: 'Kyoto', isDisabled: true })]);
  });
});

describe('removing a Destination', () => {
  // @covers REQ-TRV-075@v2
  test('DELETE an unused Destination returns 204 and it is no longer listed', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);
    const kyoto = await added(app, cookies, aDestination());

    const response = await app.inject({ method: 'DELETE', url: `/api/admin/destinations/${kyoto.id}`, cookies });

    expect(response.statusCode).toBe(204);
    expect(await adminList(app, cookies)).toEqual([]);
  });
});

describe('searching Destinations', () => {
  // @covers REQ-TRV-078@v2
  test('GET /api/destinations?q=Kyo returns Kyoto and not Tokyo', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    await added(app, adminCookies, aDestination({ name: 'Kyoto' }));
    await added(app, adminCookies, aDestination({ name: 'Tokyo' }));
    const { cookies } = await aLoggedInTraveler(app);

    expect(await travelerSearch(app, cookies, 'Kyo')).toEqual(['Kyoto']);
  });

  // @covers REQ-TRV-078@v2
  test('GET /api/destinations without a session returns 401', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/destinations?q=Kyo' });

    expect(response.statusCode).toBe(401);
  });
});
