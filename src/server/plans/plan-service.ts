import { requestTextOf, type AiReply, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import type { TripService } from '../trips/trip-service';
import type { SavedPlan } from '../../shared/plan-schemas';
import type { TripUpdate, TripView } from '../../shared/trip-schemas';
import { createAiCaller, type AiCallSettings, type AiCaller, type AiUnavailable, type LimitReached } from './ai-call';
import type { AiUsageLimitService } from './ai-usage-limit-service';
import { dayNumbersWithHandChanges } from './plan-edit';
import { buildPlanPrompt } from './plan-prompt';
import { parsePlanReply } from './plan-reply';
import { isStillTheSameTrip, promptInputForTrip } from './plan-request-context';
import type { PlanStore } from './plan-store';

export interface PlanGenerationSettings extends AiCallSettings {
  readonly destinationTextMaxChars: number;
}

export type GenerateResult =
  | { readonly ok: true; readonly plan: SavedPlan }
  | { readonly ok: false; readonly error: 'not-found' }
  /** The Trip's dates or currency were edited while the AI was answering, so its Plan no longer fits. */
  | { readonly ok: false; readonly error: 'trip-changed' }
  /** The Plan holds Activities the Traveler changed by hand, and they have not agreed to lose them. */
  | { readonly ok: false; readonly error: 'edits-would-be-replaced'; readonly days: readonly number[] }
  | AiUnavailable
  | LimitReached;

export interface GenerateOptions {
  /** The Traveler has been told that Activities they changed by hand will be replaced, and agrees. */
  readonly confirmReplaceEdits?: boolean | undefined;
  /**
   * A change to the Trip that is saved together with the new Plan or not at all, and that the Plan is written
   * for: the request describes the Trip as it will be. If the AI fails, the Trip is left as it was.
   */
  readonly tripChange?: TripUpdate | undefined;
}

export interface PlanService {
  /** Writes a Plan for the Trip, replacing the current one as a new version. */
  generate(ownerId: string, tripId: string, options?: GenerateOptions): Promise<GenerateResult>;
}

type Refusal = Extract<GenerateResult, { ok: false }>;

const NOT_FOUND: Refusal = { ok: false, error: 'not-found' };

export function createPlanService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly trips: TripService;
  readonly limits: AiUsageLimitService;
  readonly store: PlanStore;
  readonly settings: PlanGenerationSettings;
}): PlanService {
  const { db, trips, store, settings } = deps;
  const caller: AiCaller = createAiCaller(deps);

  /**
   * Saves what the AI answered. The AI took up to minutes, so the Trip is read again first: a Plan is
   * never saved onto a Trip that was deleted, or whose dates or currency changed, in the meantime. The
   * record, the saved Plan and any change to the Trip commit together, so a Plan is never saved without
   * its record, and a Trip never changes without the Plan that was written for it.
   */
  const finish = (
    ownerId: string,
    trip: TripView,
    proposed: TripView,
    recordId: string,
    reply: AiReply,
    options: GenerateOptions,
  ): GenerateResult => {
    const { tripChange } = options;
    const parsed = parsePlanReply(reply.text, proposed);
    if (!parsed.ok) {
      caller.settle(recordId, 'failed', reply);
      return { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable Plan (${parsed.problem}).` };
    }
    return caller.saveWithin(recordId, reply, (tx): GenerateResult => {
      const now = trips.getForOwner(ownerId, trip.id);
      if (!now) return NOT_FOUND;
      if (!isStillTheSameTrip(trip, now)) return { ok: false, error: 'trip-changed' };
      // The Traveler may have changed an Activity while the AI was answering, after the question was last asked.
      const current = store.current(trip.id);
      const editedDays = current ? dayNumbersWithHandChanges(current) : [];
      if (editedDays.length > 0 && options.confirmReplaceEdits !== true) {
        return { ok: false, error: 'edits-would-be-replaced', days: editedDays };
      }
      if (tripChange && !trips.update(ownerId, trip.id, tripChange).ok) return { ok: false, error: 'trip-changed' };
      return { ok: true, plan: store.save(trip.id, parsed.plan, tripChange ? 'trip-change' : 'generation', tx) };
    });
  };

  return {
    async generate(ownerId, tripId, options = {}): Promise<GenerateResult> {
      const trip = trips.getForOwner(ownerId, tripId);
      if (!trip) return NOT_FOUND;
      const proposed = options.tripChange ? trips.preview(ownerId, tripId, options.tripChange) : { ok: true as const, trip };
      const input = proposed.ok ? promptInputForTrip(db, proposed.trip, settings.destinationTextMaxChars) : null;
      if (!proposed.ok || !input) return NOT_FOUND;

      const current = store.current(trip.id);
      const editedDays = current ? dayNumbersWithHandChanges(current) : [];
      if (editedDays.length > 0 && options.confirmReplaceEdits !== true) {
        return { ok: false, error: 'edits-would-be-replaced', days: editedDays };
      }

      const prompt = buildPlanPrompt(input);
      const reservation = caller.reserve('plan-generation', ownerId, trip.id, requestTextOf(prompt));
      if (!reservation.ok) return reservation;

      const answer = await caller.ask(reservation.recordId, prompt);
      return 'refusal' in answer
        ? answer.refusal
        : finish(ownerId, trip, proposed.trip, reservation.recordId, answer.reply, options);
    },
  };
}
