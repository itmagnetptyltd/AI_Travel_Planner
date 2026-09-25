import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import type { TripInput, TripView } from '../../src/shared/trip-schemas';
import { aConfirmedTravelerSession, anAddedDestination, aTripInput, listedTrips, TODAY } from '../support/a-trip';
import { buildTestApp, type TestApp } from '../support/build-test-app';
import { accounts } from '../../src/server/db/schema';
import { accountIdOfTraveler, aTravelerWithATrip, currentPlan, generatePlan, TRAVELER_EMAIL } from '../support/a-saved-plan-journey';

interface Ready {
  readonly testApp: TestApp;
  readonly cookies: Record<string, string>;
  readonly destinationId: string;
}

async function aTravelerReadyToPlan(): Promise<Ready> {
  const testApp = await buildTestApp({ now: TODAY });
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  return { testApp, cookies: await aConfirmedTravelerSession(testApp), destinationId };
}

const post = (ready: Ready, overrides: Record<string, unknown>) =>
  ready.testApp.app.inject({
    method: 'POST',
    url: '/api/trips',
    cookies: ready.cookies,
    payload: { ...aTripInput(ready.destinationId), ...overrides },
  });

/** A Trip created with `overrides`, read back the way it is reopened. */
async function reopened(ready: Ready, overrides: Record<string, unknown>): Promise<TripView> {
  const created = await post(ready, overrides);
  expect(created.statusCode).toBe(201);
  const { id } = created.json<TripView>();
  const response = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${id}`, cookies: ready.cookies });
  return response.json<TripView>();
}

const FIVE_ACCOMMODATION_VALUES = {
  type: 'Hotel',
  budgetRange: '100 to 200 a night',
  preferredLocation: 'near the city centre',
  rating: '4 stars or better',
  facilities: 'breakfast, wifi',
};

describe('travel styles', () => {
  // @covers REQ-TRV-020@v1
  test('shows Family when a Trip saved with Family is reopened, and Family and Cultural when saved with both', async () => {
    const ready = await aTravelerReadyToPlan();

    expect((await reopened(ready, { travelStyles: ['Family'] })).travelStyles).toEqual(['Family']);
    expect((await reopened(ready, { travelStyles: ['Family', 'Cultural'] })).travelStyles).toEqual(['Family', 'Cultural']);
  });

  // @covers REQ-TRV-020@v1
  test('refuses four travel styles with 400 naming travelStyles, and saves nothing', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { travelStyles: ['Family', 'Cultural', 'Budget', 'Luxury'] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'travelStyles' });
    expect(await listedTrips(ready.testApp.app, ready.cookies)).toEqual([]);
  });
});

describe('interests', () => {
  // @covers REQ-TRV-021@v1
  test('shows History and Food when a Trip saved with both is reopened', async () => {
    const ready = await aTravelerReadyToPlan();

    expect((await reopened(ready, { interests: ['History', 'Food'] })).interests).toEqual(['History', 'Food']);
  });
});

describe('food preferences', () => {
  // @covers REQ-TRV-022@v1
  test('shows Halal, and Vegetarian with Gluten-Free, when Trips saved with them are reopened', async () => {
    const ready = await aTravelerReadyToPlan();

    expect((await reopened(ready, { foodPreferences: ['Halal'] })).foodPreferences).toEqual(['Halal']);
    expect((await reopened(ready, { foodPreferences: ['Vegetarian', 'Gluten-Free'] })).foodPreferences).toEqual(['Vegetarian', 'Gluten-Free']);
  });

  // @covers REQ-TRV-022@v1
  test('refuses No Preference together with Vegetarian with 400 naming foodPreferences, and saves nothing', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { foodPreferences: ['No Preference', 'Vegetarian'] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'foodPreferences' });
    expect(await listedTrips(ready.testApp.app, ready.cookies)).toEqual([]);
  });
});

describe('transportation', () => {
  // @covers REQ-TRV-023@v1
  test('shows Public Transport, and Public Transport with Walking, when Trips saved with them are reopened', async () => {
    const ready = await aTravelerReadyToPlan();

    expect((await reopened(ready, { transportation: ['Public Transport'] })).transportation).toEqual(['Public Transport']);
    expect((await reopened(ready, { transportation: ['Public Transport', 'Walking'] })).transportation).toEqual([
      'Public Transport',
      'Walking',
    ]);
  });

  // @covers REQ-TRV-023@v1
  test('refuses Mixed together with Taxi with 400 naming transportation, and saves nothing', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { transportation: ['Mixed', 'Taxi'] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'transportation' });
    expect(await listedTrips(ready.testApp.app, ready.cookies)).toEqual([]);
  });
});

describe('a value outside the listed options', () => {
  // @covers REQ-TRV-024@v1
  test('refuses travel style "Backpacker" with 400 naming the travel style field', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { travelStyles: ['Backpacker'] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'travelStyles' });
  });

  // @covers REQ-TRV-024@v1
  test('refuses transportation "Helicopter" with 400 naming the transportation field', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { transportation: ['Helicopter'] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'transportation' });
  });

  // @covers REQ-TRV-024@v1
  test('refuses the same values when a Trip is edited', async () => {
    const ready = await aTravelerReadyToPlan();
    const trip = await reopened(ready, {});

    const response = await ready.testApp.app.inject({
      method: 'PATCH',
      url: `/api/trips/${trip.id}`,
      cookies: ready.cookies,
      payload: { travelStyles: ['Backpacker'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'travelStyles' });
  });
});

describe('accommodation preferences', () => {
  // @covers REQ-TRV-025@v1
  test('shows the same five values when a Trip saved with them is reopened', async () => {
    const ready = await aTravelerReadyToPlan();

    expect((await reopened(ready, { accommodation: FIVE_ACCOMMODATION_VALUES })).accommodation).toEqual(FIVE_ACCOMMODATION_VALUES);
  });

  // @covers REQ-TRV-025@v1
  test('refuses a value that is not one of the five with 400 naming accommodation', async () => {
    const ready = await aTravelerReadyToPlan();

    const response = await post(ready, { accommodation: { type: 'Hotel', pool: 'yes' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: 'accommodation' });
  });

  // @covers REQ-TRV-025@v1
  test('is cleared by sending null when the Trip is edited', async () => {
    const ready = await aTravelerReadyToPlan();
    const trip = await reopened(ready, { accommodation: FIVE_ACCOMMODATION_VALUES });

    const response = await ready.testApp.app.inject({
      method: 'PATCH',
      url: `/api/trips/${trip.id}`,
      cookies: ready.cookies,
      payload: { accommodation: null },
    });

    expect(response.json()).toMatchObject({ accommodation: null });
  });

  // @covers REQ-TRV-025@v1
  test('reaches the AI: a Plan for a Trip with accommodation Hotel near the city centre sends both', async () => {
    const ready = await aTravelerWithATrip({ trip: { accommodation: { type: 'Hotel', preferredLocation: 'near the city centre' } } });

    const response = await generatePlan(ready);

    expect(response.statusCode).toBe(201);
    const [request] = ready.testApp.ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(text).toContain('Accommodation type: Hotel');
    expect(text).toContain('Preferred accommodation location: near the city centre');
  });
});

describe('what the AI is told about a Trip', () => {
  const PREFERENCES: Partial<TripInput> = {
    travelStyles: ['Family'],
    interests: ['Nature'],
    foodPreferences: ['Vegetarian'],
    transportation: ['Walking'],
  };

  // @covers REQ-TRV-028@v1
  test('carries travel style Family, interests Nature, food preference Vegetarian and transportation Walking', async () => {
    const ready = await aTravelerWithATrip({ trip: PREFERENCES });

    await generatePlan(ready);

    const [request] = ready.testApp.ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Family');
    expect(text).toContain('Interests: Nature');
    expect(text).toContain('Food preference: Vegetarian');
    expect(text).toContain('Transportation: Walking');
  });

  // @covers REQ-TRV-028@v1
  test('says 2 adults and 2 children, and has neither the Traveler name, the Trip name, the email address nor the account identifier', async () => {
    const ready = await aTravelerWithATrip({ trip: { ...PREFERENCES, name: 'Jane Citizen 40th birthday', adults: 2, children: 2 } });
    ready.testApp.db.update(accounts).set({ displayName: 'Jane Citizen' }).where(eq(accounts.email, TRAVELER_EMAIL)).run();

    await generatePlan(ready);

    const [request] = ready.testApp.ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(text).toContain('2 adults, 2 children');
    expect(text).not.toContain('Jane Citizen');
    expect(text).not.toContain(TRAVELER_EMAIL);
    expect(text).not.toContain(accountIdOfTraveler(ready.testApp));
  });

  // @covers REQ-TRV-096@v1
  test('carries Balanced, No Preference and Mixed for a Trip created with no travel style, food preference or transportation', async () => {
    const ready = await aTravelerWithATrip();

    await generatePlan(ready);

    const [request] = ready.testApp.ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Balanced');
    expect(text).toContain('Food preference: No Preference');
    expect(text).toContain('Transportation: Mixed');
  });

  // @covers REQ-TRV-096@v1
  test('does not store the defaults on the Trip, which still reads as having chosen nothing', async () => {
    const ready = await aTravelerWithATrip();
    await generatePlan(ready);

    const trip = (await listedTrips(ready.testApp.app, ready.cookies))[0];

    expect(trip).toMatchObject({ travelStyles: [], foodPreferences: [], transportation: [] });
  });
});

describe('changing preferences after a Plan exists', () => {
  // @covers REQ-TRV-028@v1
  test('leaves the saved Plan as it is, and the next Plan uses the new preferences', async () => {
    const ready = await aTravelerWithATrip({ trip: { foodPreferences: ['Vegetarian'] } });
    await generatePlan(ready);
    const saved = (await currentPlan(ready)).json();

    const edited = await ready.testApp.app.inject({
      method: 'PATCH',
      url: `/api/trips/${ready.tripId}`,
      cookies: ready.cookies,
      payload: { foodPreferences: ['Halal'] },
    });
    const afterEdit = (await currentPlan(ready)).json();
    await generatePlan(ready);

    expect(edited.statusCode).toBe(200);
    expect(afterEdit).toEqual(saved);
    const request = ready.testApp.ai.requests[1];
    expect(requestTextOf(request ?? { system: '', user: '' })).toContain('Food preference: Halal');
  });
});
