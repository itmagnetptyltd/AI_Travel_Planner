import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TrvDatabase } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import type { TripInput, TripView } from '../../src/shared/trip-schemas';
import type { TravelStyle } from '../../src/shared/travel-styles';
import { logIn, sessionCookieFrom } from './a-traveler';
import { aConfirmedTraveler, aLoggedInAdministrator } from './an-administrator';
import { aDestination } from './a-destination';
import type { TestApp } from './build-test-app';

/** "Today" in every Trip criterion that names a date. */
export const TODAY = new Date('2026-09-23T09:00:00Z');

export function aTripInput(destinationId: string, overrides: Partial<TripInput> = {}): TripInput {
  return {
    name: 'Tokyo Family Holiday',
    destinationId,
    startDate: '2026-10-10',
    endDate: '2026-10-17',
    adults: 2,
    children: 2,
    budget: 5000,
    currency: 'USD',
    ...overrides,
  };
}

/** A Traveler account written straight to the database, for service-level tests. */
export function anOwner(db: TrvDatabase, details: { readonly defaultTravelStyle?: TravelStyle } = {}): string {
  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      email: `${id}@example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'traveler',
      emailConfirmedAt: TODAY,
      defaultTravelStyle: details.defaultTravelStyle ?? null,
      createdAt: TODAY,
    })
    .run();
  return id;
}

/** Adds a Destination through the admin API and returns its id. */
export async function anAddedDestination(
  testApp: TestApp,
  overrides: Parameters<typeof aDestination>[0] = {},
): Promise<string> {
  const adminCookies = await anAdministratorSession(testApp);
  const response = await testApp.app.inject({
    method: 'POST',
    url: '/api/admin/destinations',
    cookies: adminCookies,
    payload: aDestination(overrides),
  });
  if (response.statusCode !== 201) throw new Error(`Adding a Destination failed with ${response.statusCode}`);
  return (response.json() as { id: string }).id;
}

const adminSessions = new WeakMap<FastifyInstance, Record<string, string>>();

/** One seeded Administrator per app, reused across calls. */
export async function anAdministratorSession(testApp: TestApp): Promise<Record<string, string>> {
  const existing = adminSessions.get(testApp.app);
  if (existing) return existing;
  const cookies = await aLoggedInAdministrator(testApp.app, testApp.db);
  adminSessions.set(testApp.app, cookies);
  return cookies;
}

/** A confirmed, logged-in Traveler: the only kind who may create a Trip. */
export async function aConfirmedTravelerSession(testApp: TestApp, address = 'traveler@example.com'): Promise<Record<string, string>> {
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email: address });
  return sessionCookieFrom(await logIn(testApp.app, traveler));
}

export async function createdTrip(
  app: FastifyInstance,
  cookies: Record<string, string>,
  input: TripInput,
): Promise<TripView> {
  const response = await app.inject({ method: 'POST', url: '/api/trips', cookies, payload: input });
  if (response.statusCode !== 201) throw new Error(`Creating a Trip failed with ${response.statusCode}: ${response.body}`);
  return response.json() as TripView;
}

export async function listedTrips(app: FastifyInstance, cookies: Record<string, string>): Promise<TripView[]> {
  const response = await app.inject({ method: 'GET', url: '/api/trips', cookies });
  return (response.json() as { trips: TripView[] }).trips;
}

/** A complete Trip with the number of children and every preference left blank. */
export function aTripInputWithoutChildren(destinationId: string): TripInput {
  const { name, startDate, endDate, adults, budget, currency } = aTripInput(destinationId);
  return { name, destinationId, startDate, endDate, adults, budget, currency };
}
