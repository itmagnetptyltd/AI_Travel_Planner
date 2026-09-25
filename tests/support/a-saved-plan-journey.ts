import { eq } from 'drizzle-orm';
import { accounts } from '../../src/server/db/schema';
import type { PlanVersionSummary, SavedPlan } from '../../src/shared/plan-schemas';
import { logIn, sessionCookieFrom, type TravelerDetails } from './a-traveler';
import { aConfirmedTraveler } from './an-administrator';
import { aPlanReplyText, anActivity } from './a-plan-reply';
import { anAddedDestination, aTripInput, createdTrip, TODAY } from './a-trip';
import { buildTestApp, type TestApp } from './build-test-app';

export const TRAVELER_EMAIL = 'traveler@example.com';

export interface TravelerWithTrip {
  readonly testApp: TestApp;
  readonly traveler: TravelerDetails;
  readonly cookies: Record<string, string>;
  readonly tripId: string;
}

/** A confirmed, logged-in Traveler with one saved Trip, over a fresh application. */
export async function aTravelerWithATrip(
  options: {
    readonly now?: Date;
    readonly databasePath?: string;
    readonly trip?: Parameters<typeof aTripInput>[1];
  } = {},
): Promise<TravelerWithTrip> {
  const testApp = await buildTestApp({
    now: options.now ?? TODAY,
    ...(options.databasePath === undefined ? {} : { databasePath: options.databasePath }),
  });
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email: TRAVELER_EMAIL });
  const cookies = sessionCookieFrom(await logIn(testApp.app, traveler));
  const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId, options.trip));
  return { testApp, traveler, cookies, tripId: trip.id };
}

export function generatePlan(ready: Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/plan`, cookies });
}

export function currentPlan(ready: Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/plan`, cookies });
}

export async function versionsOf(
  ready: Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>,
  cookies = ready.cookies,
): Promise<PlanVersionSummary[]> {
  const response = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/plan/versions`, cookies });
  return (response.json() as { versions: PlanVersionSummary[] }).versions;
}

export function restoreVersion(
  ready: Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>,
  version: number,
  cookies = ready.cookies,
) {
  return ready.testApp.app.inject({
    method: 'POST',
    url: `/api/trips/${ready.tripId}/plan/versions/${version}/restore`,
    cookies,
  });
}

/** Makes the AI double answer with a Plan whose every Activity carries `title`, so one Plan tells apart from another. */
export function theAiWillSuggest(testApp: TestApp, title: string, dayCount = 8): void {
  testApp.ai.replyWith(
    aPlanReplyText({
      days: Array.from({ length: dayCount }, (_, index) => ({ dayNumber: index + 1, activities: [anActivity({ title })] })),
    }),
  );
}

export const firstActivityTitle = (plan: SavedPlan): string | undefined => plan.days[0]?.activities[0]?.title;

export function accountIdOfTraveler(testApp: TestApp): string {
  return testApp.db.select().from(accounts).where(eq(accounts.email, TRAVELER_EMAIL)).get()?.id ?? '';
}
