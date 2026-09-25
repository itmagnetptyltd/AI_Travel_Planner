import { randomUUID } from 'node:crypto';
import type { PlanActivity, PlanDay, PlanView } from '../../shared/plan-schemas';
import type { EstimatedTotals, ProposedActivity, ProposedDay } from '../../shared/chat-schemas';
import { estimatesOf } from '../../shared/trip-budget';
import { inTimeOrder, type NewActivity } from '../plans/plan-edit';

/** What the AI says a Day should hold after a change: the whole list, not only what differs. */
export interface ChangedDay {
  readonly dayNumber: number;
  readonly activities: readonly NewActivity[];
}

export type ProposalResult =
  | { readonly ok: true; readonly days: readonly ProposedDay[] }
  | { readonly ok: false; readonly error: 'day-not-found' };

const DEFAULT_CATEGORY = 'Activities';
const DEFAULT_REASON = 'Suggested in the chat.';

/**
 * The AI was shown angle brackets escaped as entities, so that text could not close a block, and may write them
 * back that way. What the Traveler typed has real brackets, so an entity is turned back before anything is compared
 * or saved.
 */
const unescaped = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const titleKey = (title: string): string => unescaped(title).replace(/\s+/g, ' ').trim().toLowerCase();

const hasSameDetails = (current: PlanActivity, incoming: NewActivity): boolean =>
  current.startTime === incoming.startTime &&
  current.durationMinutes === incoming.durationMinutes &&
  current.estimatedCost === incoming.estimatedCost &&
  current.location === unescaped(incoming.location) &&
  current.category === (incoming.category ?? DEFAULT_CATEGORY);

/** The AI wrote it, not the Traveler, so it is not marked as changed by hand. */
const written = (id: string, incoming: NewActivity, mark: 'added' | 'altered', previously?: PlanActivity): ProposedActivity => ({
  id,
  title: unescaped(incoming.title),
  startTime: incoming.startTime,
  durationMinutes: incoming.durationMinutes,
  estimatedCost: incoming.estimatedCost,
  location: unescaped(incoming.location),
  reason: unescaped(incoming.reason ?? DEFAULT_REASON),
  category: incoming.category ?? DEFAULT_CATEGORY,
  changedByHand: false,
  mark,
  ...(previously ? { previously } : {}),
});

/**
 * Sets a Day's new Activities against its current ones. An Activity is matched by its title, ignoring case:
 * the same title with the same details is unchanged and stays exactly as it was, the same title with other
 * details is altered and keeps its id (and remembers what it was), a title that is new is added, and a current
 * title that is left over is removed. Null when nothing differs.
 */
function proposeDay(day: PlanDay, incoming: readonly NewActivity[]): ProposedDay | null {
  const unmatched = [...day.activities];
  const proposed = incoming.map((activity): ProposedActivity => {
    const index = unmatched.findIndex((current) => titleKey(current.title) === titleKey(activity.title));
    const [current] = index === -1 ? [] : unmatched.splice(index, 1);
    if (!current) return written(randomUUID(), activity, 'added');
    return hasSameDetails(current, activity) ? { ...current, mark: 'unchanged' } : written(current.id, activity, 'altered', current);
  });
  const isChange = unmatched.length > 0 || proposed.some((activity) => activity.mark !== 'unchanged');
  return isChange ? { dayNumber: day.dayNumber, date: day.date, activities: inTimeOrder(proposed), removed: unmatched } : null;
}

/** The Days a chat change would alter, marked. Empty when the change changes nothing. */
export function buildProposal(plan: PlanView, changes: readonly ChangedDay[]): ProposalResult {
  const days: ProposedDay[] = [];
  for (const change of changes) {
    const day = plan.days.find((candidate) => candidate.dayNumber === change.dayNumber);
    if (!day) return { ok: false, error: 'day-not-found' };
    const proposed = proposeDay(day, change.activities);
    if (proposed) days.push(proposed);
  }
  return { ok: true, days };
}

const withoutMark = (activity: ProposedActivity): PlanActivity => ({
  id: activity.id,
  title: activity.title,
  startTime: activity.startTime,
  durationMinutes: activity.durationMinutes,
  estimatedCost: activity.estimatedCost,
  location: activity.location,
  reason: activity.reason,
  category: activity.category,
  changedByHand: activity.changedByHand,
});

/** The estimated total of the Plan as it is and as it would be with the proposed Days in place (REQ-TRV-053). */
export function estimatedTotalsOf(plan: PlanView, days: readonly ProposedDay[]): EstimatedTotals {
  return { before: estimatesOf(plan).total, after: estimatesOf(applyProposal(plan, days)).total };
}

/** The Plan with the proposed Days in place, and every other Day exactly as it was (REQ-TRV-039). */
export function applyProposal(plan: PlanView, days: readonly ProposedDay[]): PlanView {
  return {
    ...plan,
    days: plan.days.map((day) => {
      const proposed = days.find((candidate) => candidate.dayNumber === day.dayNumber);
      return proposed ? { ...day, activities: proposed.activities.map(withoutMark) } : day;
    }),
  };
}
