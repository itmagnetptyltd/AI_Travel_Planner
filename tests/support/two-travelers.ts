import { aTravelerWithAShoppingPlan } from './a-chat';
import { accountIdOfTraveler, TRAVELER_EMAIL, type TravelerWithTrip } from './a-saved-plan-journey';
import { sharePlan, tokenSentTo } from './a-share-api';
import { aLoggedInTraveler } from './a-traveler';

/** What Traveler X has put in their profile, each value one that no other Traveler has and no page of the application says by itself. */
export const X_PROFILE = {
  displayName: 'Xavier Xylophone',
  preferredCurrency: 'EUR',
  defaultTravelStyle: 'Adventure',
  foodPreference: 'Vegan',
  notifications: { itineraryUpdated: false },
} as const;

export const Y_PROFILE = {
  displayName: 'Yolanda Yellowstone',
  preferredCurrency: 'JPY',
  defaultTravelStyle: 'Luxury',
  foodPreference: 'Halal',
} as const;

const Y_EMAIL = 'yolanda@example.com';
const FRIEND = 'friend@example.com';

export interface TwoTravelers {
  readonly ready: TravelerWithTrip;
  readonly x: { readonly cookies: Record<string, string>; readonly id: string; readonly email: string; readonly tripId: string };
  readonly y: { readonly cookies: Record<string, string>; readonly email: string };
  /** The token in the link X shared with a friend: the public view of X's Plan. */
  readonly sharedToken: string;
  /**
   * What is X's own, that must appear in nothing Y is sent: their name, email address and identifier, and each profile field as it
   * would be written if it were returned (`"preferredCurrency":"EUR"`), so a leak of one field is found whatever else is left out.
   */
  readonly valuesOfX: readonly string[];
}

/** Traveler X, with a Trip, a Plan, a filled-in profile and a Plan shared by link, and Traveler Y, logged in on the same application. */
export async function twoTravelers(options: Parameters<typeof aTravelerWithAShoppingPlan>[0] = {}): Promise<TwoTravelers> {
  const ready = await aTravelerWithAShoppingPlan(options);
  const { app } = ready.testApp;
  const setProfile = async (name: string, cookies: Record<string, string>, payload: object) => {
    const response = await app.inject({ method: 'PATCH', url: '/api/profile', cookies, payload });
    if (response.statusCode !== 200) throw new Error(`Setting ${name}'s profile answered ${response.statusCode}, so the tests would prove nothing.`);
  };
  await setProfile('X', ready.cookies, X_PROFILE);
  const shared = await sharePlan(ready, FRIEND);
  if (shared.statusCode >= 300) throw new Error(`Sharing X's Plan answered ${shared.statusCode}.`);
  const y = await aLoggedInTraveler(app, { email: Y_EMAIL });
  await setProfile('Y', y.cookies, Y_PROFILE);
  const xId = accountIdOfTraveler(ready.testApp);
  if (xId === '') throw new Error('Traveler X has no account identifier, so the tests would prove nothing.');
  return {
    ready,
    x: { cookies: ready.cookies, id: xId, email: TRAVELER_EMAIL, tripId: ready.tripId },
    y: { cookies: y.cookies, email: Y_EMAIL },
    sharedToken: tokenSentTo(ready, FRIEND),
    valuesOfX: [
      X_PROFILE.displayName,
      TRAVELER_EMAIL,
      xId,
      `"preferredCurrency":"${X_PROFILE.preferredCurrency}"`,
      `"defaultTravelStyle":"${X_PROFILE.defaultTravelStyle}"`,
      `"foodPreference":"${X_PROFILE.foodPreference}"`,
      '"itineraryUpdated":false',
    ],
  };
}
