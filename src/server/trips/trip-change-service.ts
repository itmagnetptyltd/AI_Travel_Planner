import type { TrvDatabase } from '../db/client';
import { adjustToDates } from '../plans/plan-edit';
import type { GenerateResult, PlanService } from '../plans/plan-service';
import type { PlanStore } from '../plans/plan-store';
import type { SavedPlan, WarnedPlanEffect } from '../../shared/plan-schemas';
import type { TripUpdate, TripView } from '../../shared/trip-schemas';
import type { TripResult, TripService } from './trip-service';

/** What a change to a Trip does to the Trip's Plan (REQ-TRV-098). */
export type PlanEffect =
  /** Nothing about the Plan depends on what changed. */
  | { readonly kind: 'none' }
  /** The Destination changed, so the Plan is written again for the new one (needs the AI), or the Trip got shorter and Days are dropped. */
  | WarnedPlanEffect
  /** The Trip moved or got longer: Days keep their order, are dated from the new start, and empty ones are added. */
  | { readonly kind: 'adjust' };

export type ChangeResult =
  | { readonly ok: true; readonly trip: TripView }
  | Extract<TripResult, { ok: false }>
  | { readonly ok: false; readonly error: 'needs-confirmation'; readonly effect: WarnedPlanEffect }
  | Extract<GenerateResult, { ok: false }>;

export interface ChangeOptions {
  /** The Traveler has been told what the change does to the Plan, and agrees. */
  readonly confirmPlanChange?: boolean | undefined;
}

export interface TripChangeService {
  /**
   * Changes a Trip, and its Plan with it if it has one. A change that would replace or shorten the Plan is
   * made only once the Traveler has agreed. The Trip and the Plan change together or not at all.
   */
  change(ownerId: string, tripId: string, change: TripUpdate, options?: ChangeOptions): Promise<ChangeResult>;
}

const NO_EFFECT: PlanEffect = { kind: 'none' };

function planEffectOf(before: TripView, after: TripView, plan: SavedPlan): PlanEffect {
  if (before.destination.id !== after.destination.id) return { kind: 'regenerate' };
  if (before.startDate === after.startDate && before.endDate === after.endDate) return NO_EFFECT;
  if (after.dayCount >= plan.days.length) return { kind: 'adjust' };
  const droppedDays = plan.days.slice(after.dayCount).map((day) => day.dayNumber);
  return { kind: 'drop-days', droppedDays };
}

export function createTripChangeService(deps: {
  readonly db: TrvDatabase;
  readonly trips: TripService;
  readonly store: PlanStore;
  readonly plans: PlanService;
}): TripChangeService {
  const { db, trips, store, plans } = deps;

  /** Saves the Trip and its adjusted Plan in one step, so neither is ever saved without the other. */
  const changeWithAdjustedPlan = (ownerId: string, tripId: string, change: TripUpdate, plan: SavedPlan): ChangeResult =>
    db.transaction((tx): ChangeResult => {
      const updated = trips.update(ownerId, tripId, change);
      if (!updated.ok) return updated;
      store.save(tripId, adjustToDates(plan, updated.trip.startDate, updated.trip.dayCount), 'trip-change', tx);
      return updated;
    });

  return {
    async change(ownerId, tripId, change, options = {}) {
      const previewed = trips.preview(ownerId, tripId, change);
      if (!previewed.ok) return previewed;
      const before = trips.getForOwner(ownerId, tripId);
      if (!before) return { ok: false, error: 'not-found' };
      const plan = store.current(tripId);
      const effect = plan ? planEffectOf(before, previewed.trip, plan) : NO_EFFECT;

      if (effect.kind === 'none' || !plan) return trips.update(ownerId, tripId, change);
      if (effect.kind === 'adjust') return changeWithAdjustedPlan(ownerId, tripId, change, plan);
      if (options.confirmPlanChange !== true) return { ok: false, error: 'needs-confirmation', effect };
      if (effect.kind === 'drop-days') return changeWithAdjustedPlan(ownerId, tripId, change, plan);

      const generated = await plans.generate(ownerId, tripId, { confirmReplaceEdits: true, tripChange: change });
      if (!generated.ok) return generated;
      const changed = trips.getForOwner(ownerId, tripId);
      return changed ? { ok: true, trip: changed } : { ok: false, error: 'not-found' };
    },
  };
}
