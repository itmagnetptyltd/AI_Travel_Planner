import type { PlanActivity, PlanView, SavedPlan } from '../../src/shared/plan-schemas';
import { aTravelerWithATrip, currentPlan, generatePlan, type TravelerWithTrip } from './a-saved-plan-journey';
import { aPlanReplyText, anActivity } from './a-plan-reply';

type Ready = Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>;

/** A Traveler whose Trip already has a generated 8-Day Plan of three Activities a Day (09:00, 12:30, 18:00). */
export async function aTravelerWithAPlan(
  options: Parameters<typeof aTravelerWithATrip>[0] & { readonly dayCount?: number } = {},
): Promise<TravelerWithTrip & { readonly plan: SavedPlan }> {
  const ready = await aTravelerWithATrip(options);
  ready.testApp.ai.replyWith(aPlanReplyText({ dayCount: options.dayCount ?? 8 }));
  const generated = await generatePlan(ready);
  if (generated.statusCode !== 201) throw new Error(`Generating the first Plan failed with ${generated.statusCode}`);
  return { ...ready, plan: generated.json() as SavedPlan };
}

export async function planOf(ready: Ready, cookies = ready.cookies): Promise<SavedPlan> {
  const response = await currentPlan(ready, cookies);
  if (response.statusCode !== 200) throw new Error(`Reading the Plan failed with ${response.statusCode}`);
  return response.json() as SavedPlan;
}

export const activityAt = (plan: PlanView, dayNumber: number, index: number): PlanActivity => {
  const activity = plan.days.find((day) => day.dayNumber === dayNumber)?.activities[index];
  if (!activity) throw new Error(`Day ${dayNumber} has no Activity at position ${index}`);
  return activity;
};

export const titlesOnDay = (plan: PlanView, dayNumber: number): string[] =>
  plan.days.find((day) => day.dayNumber === dayNumber)?.activities.map((activity) => activity.title) ?? [];

export const startTimesOnDay = (plan: PlanView, dayNumber: number): string[] =>
  plan.days.find((day) => day.dayNumber === dayNumber)?.activities.map((activity) => activity.startTime) ?? [];

export const A_TYPED_ACTIVITY = {
  title: 'Sunrise swim',
  startTime: '09:00',
  durationMinutes: 45,
  estimatedCost: 0,
  location: 'Kamo river',
} as const;

const activityUrl = (ready: Ready, activityId: string) => `/api/trips/${ready.tripId}/plan/activities/${encodeURIComponent(activityId)}`;

export function editActivityOf(ready: Ready, activityId: string, payload: unknown, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'PATCH', url: activityUrl(ready, activityId), cookies, payload: payload as object });
}

export function removeActivityOf(ready: Ready, activityId: string, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'DELETE', url: activityUrl(ready, activityId), cookies });
}

export function moveActivityOf(ready: Ready, activityId: string, payload: unknown, cookies = ready.cookies) {
  return ready.testApp.app.inject({
    method: 'POST',
    url: `${activityUrl(ready, activityId)}/move`,
    cookies,
    payload: payload as object,
  });
}

export function replaceActivityOf(ready: Ready, activityId: string, payload: unknown, cookies = ready.cookies) {
  return ready.testApp.app.inject({
    method: 'POST',
    url: `${activityUrl(ready, activityId)}/replace`,
    cookies,
    payload: payload as object,
  });
}

export function suggestionFor(ready: Ready, activityId: string, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `${activityUrl(ready, activityId)}/suggestion`, cookies });
}

export function regenerateDayOf(ready: Ready, dayNumber: number, payload?: unknown, cookies = ready.cookies) {
  return ready.testApp.app.inject({
    method: 'POST',
    url: `/api/trips/${ready.tripId}/plan/days/${dayNumber}/regenerate`,
    cookies,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

export function regeneratePlanOf(ready: Ready, payload?: unknown, cookies = ready.cookies) {
  return ready.testApp.app.inject({
    method: 'POST',
    url: `/api/trips/${ready.tripId}/plan`,
    cookies,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

/** An AI reply for one Day: the JSON the AI is asked for when a single Day is regenerated. */
export function aDayReplyText(dayNumber: number, activities: readonly Partial<ReturnType<typeof anActivity>>[]): string {
  return JSON.stringify({ dayNumber, activities: activities.map((activity) => anActivity(activity)) });
}

/** An AI reply for one suggested replacement Activity. */
export function anActivityReplyText(overrides: Partial<ReturnType<typeof anActivity>> = {}): string {
  return JSON.stringify({ activity: anActivity({ title: 'Tea ceremony', startTime: '09:00', ...overrides }) });
}
