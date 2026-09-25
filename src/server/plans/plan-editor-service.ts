import type { PlanView, SavedPlan } from '../../shared/plan-schemas';
import type { TripService } from '../trips/trip-service';
import {
  editActivity,
  moveActivity,
  removeActivity,
  replaceActivity,
  type ActivityEdit,
  type NewActivity,
  type PlanEditError,
  type PlanEditResult,
} from './plan-edit';
import type { PlanStore } from './plan-store';

export type EditOutcome =
  | { readonly ok: true; readonly plan: SavedPlan }
  | { readonly ok: false; readonly error: 'trip-not-found' | 'no-plan' | PlanEditError };

/**
 * The Traveler's own changes to a saved Plan. None of them asks the AI anything, so they work when it
 * is down (REQ-TRV-103) and never count against the daily limit. Each one saves a new version.
 */
export interface PlanEditorService {
  editActivity(ownerId: string, tripId: string, activityId: string, edit: ActivityEdit): EditOutcome;
  removeActivity(ownerId: string, tripId: string, activityId: string): EditOutcome;
  moveActivity(ownerId: string, tripId: string, activityId: string, toDayNumber: number): EditOutcome;
  replaceActivity(
    ownerId: string,
    tripId: string,
    activityId: string,
    replacement: NewActivity,
    origin: 'typed' | 'suggestion',
  ): EditOutcome;
}

export function createPlanEditorService(deps: { readonly trips: TripService; readonly store: PlanStore }): PlanEditorService {
  const { trips, store } = deps;

  /**
   * Nothing waits between reading the Plan and saving the change, so no other request can slip a change
   * in between.
   */
  const apply = (ownerId: string, tripId: string, change: (plan: PlanView) => PlanEditResult): EditOutcome => {
    if (!trips.getForOwner(ownerId, tripId)) return { ok: false, error: 'trip-not-found' };
    const current = store.current(tripId);
    if (!current) return { ok: false, error: 'no-plan' };
    const changed = change(current);
    return changed.ok ? { ok: true, plan: store.save(tripId, changed.plan, 'edit') } : changed;
  };

  return {
    editActivity: (ownerId, tripId, activityId, edit) => apply(ownerId, tripId, (plan) => editActivity(plan, activityId, edit)),
    removeActivity: (ownerId, tripId, activityId) => apply(ownerId, tripId, (plan) => removeActivity(plan, activityId)),
    moveActivity: (ownerId, tripId, activityId, toDay) => apply(ownerId, tripId, (plan) => moveActivity(plan, activityId, toDay)),
    replaceActivity: (ownerId, tripId, activityId, replacement, origin) =>
      apply(ownerId, tripId, (plan) => replaceActivity(plan, activityId, replacement, origin)),
  };
}
