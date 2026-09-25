import { requestTextOf, type AiReply, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import type { TripService } from '../trips/trip-service';
import type { SavedPlan } from '../../shared/plan-schemas';
import type { TripView } from '../../shared/trip-schemas';
import { createAiCaller, type AiCaller, type AiUnavailable, type LimitReached } from './ai-call';
import type { AiUsageLimitService } from './ai-usage-limit-service';
import { dayNumbersWithHandChanges, replaceDay, type NewActivity } from './plan-edit';
import { buildActivityPrompt, buildDayPrompt, type PlanPromptInput } from './plan-prompt';
import { parseActivityReply, parseDayReply } from './plan-reply';
import { isStillTheSameTrip, promptInputForTrip } from './plan-request-context';
import type { PlanGenerationSettings } from './plan-service';
import type { PlanStore } from './plan-store';

export type RegenerationRefusal =
  | { readonly ok: false; readonly error: 'not-found' | 'no-plan' | 'day-not-found' | 'activity-not-found' | 'trip-changed' }
  /** The Day holds Activities the Traveler changed by hand, and they have not agreed to lose them. */
  | { readonly ok: false; readonly error: 'edits-would-be-replaced'; readonly days: readonly number[] }
  | AiUnavailable
  | LimitReached;

export type DayResult = { readonly ok: true; readonly plan: SavedPlan } | RegenerationRefusal;
export type SuggestionResult = { readonly ok: true; readonly activity: NewActivity } | RegenerationRefusal;

export interface RegenerateDayOptions {
  /** The Traveler has been told that Activities they changed by hand on that Day will be replaced, and agrees. */
  readonly confirmReplaceEdits?: boolean | undefined;
}

/** The parts of a Plan that ask the AI to write less than a whole Plan. Both count toward the daily limit. */
export interface PlanRegenerationService {
  regenerateDay(ownerId: string, tripId: string, dayNumber: number, options?: RegenerateDayOptions): Promise<DayResult>;
  /** Suggests an Activity to replace one. Nothing is saved: the Traveler accepts it, or does not. */
  suggestReplacement(ownerId: string, tripId: string, activityId: string): Promise<SuggestionResult>;
}

interface Context {
  readonly trip: TripView;
  readonly input: PlanPromptInput;
  readonly plan: SavedPlan;
}

export function createPlanRegenerationService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly trips: TripService;
  readonly limits: AiUsageLimitService;
  readonly store: PlanStore;
  readonly settings: PlanGenerationSettings;
}): PlanRegenerationService {
  const { db, trips, store, settings } = deps;
  const caller: AiCaller = createAiCaller(deps);

  const contextOf = (ownerId: string, tripId: string): Context | RegenerationRefusal => {
    const trip = trips.getForOwner(ownerId, tripId);
    const input = trip ? promptInputForTrip(db, trip, settings.destinationTextMaxChars) : null;
    if (!trip || !input) return { ok: false, error: 'not-found' };
    const plan = store.current(tripId);
    return plan ? { trip, input, plan } : { ok: false, error: 'no-plan' };
  };

  const unusable = (recordId: string, reply: AiReply, problem: string, what: string): AiUnavailable => {
    caller.settle(recordId, 'failed', reply);
    return { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable ${what} (${problem}).` };
  };

  /**
   * Saves the regenerated Day onto the Plan as it is now, not as it was when the Day was asked for: the AI
   * took up to minutes, and the Traveler may have edited in the meantime. Nothing is saved onto a Trip that
   * was deleted or whose dates or currency changed.
   */
  const saveDay = (
    ownerId: string,
    before: TripView,
    dayNumber: number,
    recordId: string,
    reply: AiReply,
    options: RegenerateDayOptions,
  ): DayResult => {
    const parsed = parseDayReply(reply.text, dayNumber);
    if (!parsed.ok) return unusable(recordId, reply, parsed.problem, 'Day');
    return caller.saveWithin(recordId, reply, (tx): DayResult => {
      const now = trips.getForOwner(ownerId, before.id);
      if (!now) return { ok: false, error: 'not-found' };
      if (!isStillTheSameTrip(before, now)) return { ok: false, error: 'trip-changed' };
      const current = store.current(before.id);
      if (!current) return { ok: false, error: 'no-plan' };
      // The Traveler may have changed an Activity on this Day while the AI was answering.
      const editedDays = dayNumbersWithHandChanges(current, dayNumber);
      if (editedDays.length > 0 && options.confirmReplaceEdits !== true) {
        return { ok: false, error: 'edits-would-be-replaced', days: editedDays };
      }
      const replaced = replaceDay(current, dayNumber, parsed.activities);
      if (!replaced.ok) return { ok: false, error: 'day-not-found' };
      return { ok: true, plan: store.save(before.id, replaced.plan, 'day-regeneration', tx) };
    });
  };

  return {
    async regenerateDay(ownerId, tripId, dayNumber, options = {}) {
      const context = contextOf(ownerId, tripId);
      if ('ok' in context) return context;
      const day = context.plan.days.find((candidate) => candidate.dayNumber === dayNumber);
      if (!day) return { ok: false, error: 'day-not-found' };
      const editedDays = dayNumbersWithHandChanges(context.plan, dayNumber);
      if (editedDays.length > 0 && options.confirmReplaceEdits !== true) {
        return { ok: false, error: 'edits-would-be-replaced', days: editedDays };
      }

      const prompt = buildDayPrompt(context.input, { dayNumber, date: day.date });
      const reservation = caller.reserve('day-regeneration', ownerId, tripId, requestTextOf(prompt));
      if (!reservation.ok) return reservation;
      const answer = await caller.ask(reservation.recordId, prompt);
      return 'refusal' in answer ? answer.refusal : saveDay(ownerId, context.trip, dayNumber, reservation.recordId, answer.reply, options);
    },

    async suggestReplacement(ownerId, tripId, activityId) {
      const context = contextOf(ownerId, tripId);
      if ('ok' in context) return context;
      const day = context.plan.days.find((candidate) => candidate.activities.some((activity) => activity.id === activityId));
      const activity = day?.activities.find((candidate) => candidate.id === activityId);
      if (!day || !activity) return { ok: false, error: 'activity-not-found' };

      const prompt = buildActivityPrompt(context.input, {
        dayNumber: day.dayNumber,
        date: day.date,
        title: activity.title,
        startTime: activity.startTime,
      });
      const reservation = caller.reserve('activity-suggestion', ownerId, tripId, requestTextOf(prompt));
      if (!reservation.ok) return reservation;
      const answer = await caller.ask(reservation.recordId, prompt);
      if ('refusal' in answer) return answer.refusal;

      const parsed = parseActivityReply(answer.reply.text);
      if (!parsed.ok) return unusable(reservation.recordId, answer.reply, parsed.problem, 'Activity');
      caller.settle(reservation.recordId, 'succeeded', answer.reply);
      return { ok: true, activity: parsed.activity };
    },
  };
}
