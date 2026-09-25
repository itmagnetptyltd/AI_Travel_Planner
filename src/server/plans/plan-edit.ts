import { randomUUID } from 'node:crypto';
import type { ActivityCategory, PlanActivity, PlanDay, PlanView } from '../../shared/plan-schemas';
import { dateOfTripDay } from '../../shared/trip-schemas';

/** An Activity the Traveler typed, or one the AI suggested and the Traveler accepted. */
export interface NewActivity {
  readonly title: string;
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly estimatedCost: number;
  readonly location: string;
  readonly category?: ActivityCategory | undefined;
  readonly reason?: string | undefined;
}

/** What an edit may change. Anything left out, or undefined, stays as it was. */
export interface ActivityEdit {
  readonly title?: string | undefined;
  readonly startTime?: string | undefined;
  readonly durationMinutes?: number | undefined;
  readonly estimatedCost?: number | undefined;
  readonly location?: string | undefined;
  readonly category?: ActivityCategory | undefined;
}

export type PlanEditError = 'activity-not-found' | 'day-not-found' | 'already-on-that-day';

export type PlanEditResult =
  | { readonly ok: true; readonly plan: PlanView }
  | { readonly ok: false; readonly error: PlanEditError };

const DEFAULT_CATEGORY: ActivityCategory = 'Activities';
const TYPED_REASON = 'Added by you.';

const refused = (error: PlanEditError): PlanEditResult => ({ ok: false, error });
const done = (plan: PlanView): PlanEditResult => ({ ok: true, plan });

/** A Day's Activities in start-time order. `sort` is stable, so equal times keep the order they had. */
const inTimeOrder = (activities: readonly PlanActivity[]): readonly PlanActivity[] =>
  [...activities].sort((a, b) => a.startTime.localeCompare(b.startTime));

function withEdit(activity: PlanActivity, edit: ActivityEdit): PlanActivity {
  return {
    ...activity,
    ...(edit.title !== undefined ? { title: edit.title } : {}),
    ...(edit.startTime !== undefined ? { startTime: edit.startTime } : {}),
    ...(edit.durationMinutes !== undefined ? { durationMinutes: edit.durationMinutes } : {}),
    ...(edit.estimatedCost !== undefined ? { estimatedCost: edit.estimatedCost } : {}),
    ...(edit.location !== undefined ? { location: edit.location } : {}),
    ...(edit.category !== undefined ? { category: edit.category } : {}),
    changedByHand: true,
  };
}

function locate(plan: PlanView, activityId: string): { readonly day: PlanDay; readonly activity: PlanActivity } | null {
  for (const day of plan.days) {
    const activity = day.activities.find((candidate) => candidate.id === activityId);
    if (activity) return { day, activity };
  }
  return null;
}

/** The Plan with one Day changed and every other Day left exactly as it was. */
const withDay = (plan: PlanView, dayNumber: number, change: (day: PlanDay) => PlanDay): PlanView => ({
  ...plan,
  days: plan.days.map((day) => (day.dayNumber === dayNumber ? change(day) : day)),
});

export function editActivity(plan: PlanView, activityId: string, edit: ActivityEdit): PlanEditResult {
  const found = locate(plan, activityId);
  if (!found) return refused('activity-not-found');
  const edited = withEdit(found.activity, edit);
  return done(withDay(plan, found.day.dayNumber, (day) => ({
    ...day,
    activities: inTimeOrder(day.activities.map((activity) => (activity.id === activityId ? edited : activity))),
  })));
}

export function removeActivity(plan: PlanView, activityId: string): PlanEditResult {
  const found = locate(plan, activityId);
  if (!found) return refused('activity-not-found');
  return done(withDay(plan, found.day.dayNumber, (day) => ({
    ...day,
    activities: day.activities.filter((activity) => activity.id !== activityId),
  })));
}

export function moveActivity(plan: PlanView, activityId: string, toDayNumber: number): PlanEditResult {
  const found = locate(plan, activityId);
  if (!found) return refused('activity-not-found');
  if (!plan.days.some((day) => day.dayNumber === toDayNumber)) return refused('day-not-found');
  if (found.day.dayNumber === toDayNumber) return refused('already-on-that-day');
  const moved: PlanActivity = { ...found.activity, changedByHand: true };
  const withoutIt = withDay(plan, found.day.dayNumber, (day) => ({
    ...day,
    activities: day.activities.filter((activity) => activity.id !== activityId),
  }));
  return done(withDay(withoutIt, toDayNumber, (day) => ({ ...day, activities: inTimeOrder([...day.activities, moved]) })));
}

/** `origin` says who wrote it: a suggestion the AI wrote is not a hand change, one the Traveler typed is. */
export function replaceActivity(
  plan: PlanView,
  activityId: string,
  replacement: NewActivity,
  origin: 'typed' | 'suggestion',
): PlanEditResult {
  const found = locate(plan, activityId);
  if (!found) return refused('activity-not-found');
  const added: PlanActivity = {
    id: randomUUID(),
    title: replacement.title,
    startTime: replacement.startTime,
    durationMinutes: replacement.durationMinutes,
    estimatedCost: replacement.estimatedCost,
    location: replacement.location,
    reason: replacement.reason ?? TYPED_REASON,
    category: replacement.category ?? DEFAULT_CATEGORY,
    changedByHand: origin === 'typed',
  };
  return done(withDay(plan, found.day.dayNumber, (day) => ({
    ...day,
    activities: inTimeOrder(day.activities.map((activity) => (activity.id === activityId ? added : activity))),
  })));
}

/** Puts new Activities on one Day. The Day keeps its number and date. */
export function replaceDay(plan: PlanView, dayNumber: number, activities: readonly PlanActivity[]): PlanEditResult {
  if (!plan.days.some((day) => day.dayNumber === dayNumber)) return refused('day-not-found');
  return done(withDay(plan, dayNumber, (day) => ({ ...day, activities: inTimeOrder(activities) })));
}

/** The numbers of the Days holding an Activity the Traveler changed by hand: all Days, or just `dayNumber`. */
export function dayNumbersWithHandChanges(plan: PlanView, dayNumber?: number): readonly number[] {
  return plan.days
    .filter((day) => dayNumber === undefined || day.dayNumber === dayNumber)
    .filter((day) => day.activities.some((activity) => activity.changedByHand))
    .map((day) => day.dayNumber);
}

/**
 * Fits a Plan to a Trip's new dates: Days keep their order, extra Days at the end are dropped, and
 * missing ones are added empty. Every Day is dated from the new start, so moving the Trip re-dates it.
 */
export function adjustToDates(plan: PlanView, startDate: string, dayCount: number): PlanView {
  const days: PlanDay[] = Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;
    const existing = plan.days.find((day) => day.dayNumber === dayNumber);
    return { dayNumber, date: dateOfTripDay(startDate, dayNumber), activities: existing?.activities ?? [] };
  });
  return { ...plan, days };
}
