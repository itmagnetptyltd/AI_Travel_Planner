import type { FeedbackInput } from '../../src/shared/feedback-schemas';
import { aPlanReplyText } from './a-plan-reply';
import { aTripInput, anAddedDestination, anAdministratorSession, createdTrip } from './a-trip';
import { logIn, sessionCookieFrom, VALID_PASSWORD } from './a-traveler';
import { ADMIN_EMAIL } from './an-administrator';
import { aConfirmedTraveler } from './an-administrator';
import { buildTestApp, type TestApp } from './build-test-app';
import { TODAY } from './a-trip';

export interface ScenarioTraveler {
  readonly email: string;
  readonly cookies: Record<string, string>;
  readonly tripId: string;
}

/** One application with an Administrator and Travelers who each have a Trip with a Plan, built through the API. */
export async function anAdminScenario(options: Parameters<typeof buildTestApp>[0] = {}) {
  const testApp = await buildTestApp({ now: TODAY, ...options });
  let admin = await anAdministratorSession(testApp);
  const destinationIds = new Map<string, string>();

  const destinationIdOf = async (name: string): Promise<string> => {
    const known = destinationIds.get(name);
    if (known) return known;
    const id = await anAddedDestination(testApp, { name, country: 'Japan' });
    destinationIds.set(name, id);
    return id;
  };

  type TripSettings = { destination?: string; tripName?: string; withPlan?: boolean; trip?: Parameters<typeof aTripInput>[1] };

  /** Another Trip for a Traveler who is already logged in, with a generated Plan (8 Days) unless `withPlan` is false. */
  const addTrip = async (email: string, cookies: Record<string, string>, settings: TripSettings): Promise<ScenarioTraveler> => {
    const destinationId = await destinationIdOf(settings.destination ?? 'Tokyo');
    const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId, { name: settings.tripName ?? 'Tokyo Family Holiday', ...settings.trip }));
    if (settings.withPlan !== false) {
      testApp.ai.replyWith(aPlanReplyText({ dayCount: 8 }));
      const generated = await testApp.app.inject({ method: 'POST', url: `/api/trips/${trip.id}/plan`, cookies });
      if (generated.statusCode !== 201) throw new Error(`Generating the Plan failed with ${generated.statusCode}`);
    }
    return { email, cookies, tripId: trip.id };
  };

  /** A confirmed Traveler with a Trip to `destination` and a generated Plan (8 Days), unless `withPlan` is false. */
  const aTraveler = async (email: string, settings: TripSettings = {}): Promise<ScenarioTraveler> => {
    const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email });
    return addTrip(email, sessionCookieFrom(await logIn(testApp.app, traveler)), settings);
  };

  const anotherTrip = (traveler: ScenarioTraveler, settings: TripSettings = {}) => addTrip(traveler.email, traveler.cookies, settings);

  const feedbackFrom = async (traveler: ScenarioTraveler, input: FeedbackInput | { rating: number; comment?: string }) => {
    const response = await testApp.app.inject({ method: 'PUT', url: `/api/trips/${traveler.tripId}/feedback`, cookies: traveler.cookies, payload: input });
    if (response.statusCode !== 200) throw new Error(`Giving feedback failed with ${response.statusCode}`);
  };

  /** Logs `email` in again, as after time has passed and the session has ended. */
  const loginAgain = async (email: string): Promise<Record<string, string>> =>
    sessionCookieFrom(await logIn(testApp.app, { email, password: VALID_PASSWORD }));

  /** The Administrator logs in again, and every later `asAdmin` call uses the new session. */
  const adminLoginAgain = async (): Promise<void> => {
    admin = await loginAgain(ADMIN_EMAIL);
  };

  const asAdmin = (method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    testApp.app.inject({ method, url, cookies: admin, ...(payload ? { payload } : {}) });

  return {
    testApp: testApp as TestApp,
    /** The Administrator's current session. */
    get admin() {
      return admin;
    },
    aTraveler,
    loginAgain,
    adminLoginAgain,
    anotherTrip,
    feedbackFrom,
    asAdmin,
    destinationIdOf,
  };
}
