import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Currency } from '../../shared/currencies';
import { dateOfTripDay } from '../../shared/trip-schemas';
import type { NewActivity } from './plan-edit';
import { ACTIVITY_CATEGORIES, type PlanActivity, type PlanDay, type PlanView } from '../../shared/plan-schemas';

export type PlanReplyProblem = 'not-json' | 'invalid' | 'wrong-days';

export type PlanReplyResult =
  | { readonly ok: true; readonly plan: PlanView }
  | { readonly ok: false; readonly problem: PlanReplyProblem };

export interface PlanReplyTrip {
  readonly startDate: string;
  readonly dayCount: number;
  readonly currency: Currency;
  readonly adults: number;
  readonly children: number;
  readonly budget: number;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const wholeCost = z.number().nonnegative().max(10_000_000).transform(Math.round);

export const activitySchema = z.object({
  title: text(200),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(1).max(24 * 60),
  estimatedCost: wholeCost,
  location: text(200),
  reason: text(1000),
  category: z.enum(ACTIVITY_CATEGORIES),
});

const replySchema = z.object({
  days: z
    .array(z.object({ dayNumber: z.number().int().min(1), activities: z.array(activitySchema).min(1) }))
    .min(1),
  stay: z.object({
    accommodationType: text(100),
    suggestedArea: text(200),
    nightlyCostEstimate: wholeCost,
  }),
});

/** The JSON object in a reply, allowing for a code fence or a sentence around it. */
export function jsonIn(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const byStartTime = (a: PlanActivity, b: PlanActivity) => a.startTime.localeCompare(b.startTime);

type ReplyActivity = z.output<typeof activitySchema>;

/** The server, never the AI, decides an Activity's id and that no Traveler has touched it yet. */
const asPlanActivity = (activity: ReplyActivity): PlanActivity => ({
  id: randomUUID(),
  title: activity.title,
  startTime: activity.startTime,
  durationMinutes: activity.durationMinutes,
  estimatedCost: activity.estimatedCost,
  location: activity.location,
  reason: activity.reason,
  category: activity.category,
  changedByHand: false,
});

/**
 * Turns an AI reply into a Plan. The reply is untrusted: anything that is not exactly one Day per
 * Trip date, each with an Activity, is refused rather than repaired, and the server — not the AI —
 * says which date each Day falls on.
 */
export function parsePlanReply(reply: string, trip: PlanReplyTrip): PlanReplyResult {
  const raw = jsonIn(reply);
  if (raw === undefined) return { ok: false, problem: 'not-json' };
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };

  const numbers = parsed.data.days.map((day) => day.dayNumber).sort((a, b) => a - b);
  const isOneDayPerDate = numbers.length === trip.dayCount && numbers.every((n, index) => n === index + 1);
  if (!isOneDayPerDate) return { ok: false, problem: 'wrong-days' };

  const days: PlanDay[] = [...parsed.data.days]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({
      dayNumber: day.dayNumber,
      date: dateOfTripDay(trip.startDate, day.dayNumber),
      activities: day.activities.map(asPlanActivity).sort(byStartTime),
    }));
  return {
    ok: true,
    plan: {
      currency: trip.currency,
      days,
      stay: parsed.data.stay,
      basis: { adults: trip.adults, children: trip.children, budget: trip.budget },
    },
  };
}

export type DayReplyResult =
  | { readonly ok: true; readonly activities: readonly PlanActivity[] }
  | { readonly ok: false; readonly problem: 'not-json' | 'invalid' | 'wrong-day' };

const dayReplySchema = z.object({ dayNumber: z.number().int().min(1), activities: z.array(activitySchema).min(1) });

/** One regenerated Day. Refused, never repaired, when it is for another Day or holds no Activity. */
export function parseDayReply(reply: string, dayNumber: number): DayReplyResult {
  const raw = jsonIn(reply);
  if (raw === undefined) return { ok: false, problem: 'not-json' };
  const parsed = dayReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  if (parsed.data.dayNumber !== dayNumber) return { ok: false, problem: 'wrong-day' };
  return { ok: true, activities: parsed.data.activities.map(asPlanActivity).sort(byStartTime) };
}

export type ActivityReplyResult =
  | { readonly ok: true; readonly activity: NewActivity }
  | { readonly ok: false; readonly problem: 'not-json' | 'invalid' };

const activityReplySchema = z.object({ activity: activitySchema });

/** One suggested replacement Activity, as the fields the Traveler can accept it with. */
export function parseActivityReply(reply: string): ActivityReplyResult {
  const raw = jsonIn(reply);
  if (raw === undefined) return { ok: false, problem: 'not-json' };
  const parsed = activityReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  const { title, startTime, durationMinutes, estimatedCost, location, reason, category } = parsed.data.activity;
  return { ok: true, activity: { title, startTime, durationMinutes, estimatedCost, location, reason, category } };
}
