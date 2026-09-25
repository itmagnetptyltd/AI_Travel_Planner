import { randomUUID } from 'node:crypto';
import { and, desc, eq, lte, max } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { planVersions, trips } from '../db/schema';
import {
  MAX_PLAN_VERSIONS,
  planViewSchema,
  type PlanVersionSource,
  type PlanVersionSummary,
  type PlanView,
  type SavedPlan,
} from '../../shared/plan-schemas';

/** The database, or a transaction already open on it. */
export type Executor = Pick<TrvDatabase, 'select' | 'insert' | 'update' | 'delete'>;

export interface PlanStore {
  /**
   * Saves `plan` as the Trip's next version and makes the Trip Planned, in one step. Pass `within` to
   * make it part of a transaction the caller has open; SQLite cannot start one inside another.
   */
  save(tripId: string, plan: PlanView, source: PlanVersionSource, within?: Executor): SavedPlan;
  current(tripId: string): SavedPlan | null;
  /** Newest first. */
  listVersions(tripId: string): readonly PlanVersionSummary[];
  /**
   * Saves a copy of an earlier version as a new version. Restoring the newest version changes nothing.
   * Null when there is no such version.
   */
  restore(tripId: string, version: number): SavedPlan | null;
}

type VersionRow = typeof planVersions.$inferSelect;
type StoredPlan = ReturnType<typeof planViewSchema.parse>;

/**
 * A Plan saved before Activities had ids gets one by position when it is read, the same every time, so
 * an edit can name it. Once the Plan is next saved the id is stored and stops depending on position.
 */
function withIds(stored: StoredPlan): PlanView {
  const days = stored.days.map((day) => ({
    ...day,
    activities: day.activities.map((activity, index) => ({
      ...activity,
      id: activity.id ?? `day-${day.dayNumber}-activity-${index + 1}`,
    })),
  }));
  return { currency: stored.currency, days, stay: stored.stay, ...(stored.basis ? { basis: stored.basis } : {}) };
}

/** A stored snapshot is data read back from disk, so it is checked, never trusted. */
function savedPlanOf(row: VersionRow): SavedPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(row.planJson);
  } catch {
    raw = undefined;
  }
  const parsed = planViewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`The stored Plan for Trip ${row.tripId}, version ${row.versionNumber}, is not a valid Plan.`);
  }
  return { ...withIds(parsed.data), version: row.versionNumber, createdAt: row.createdAt.toISOString(), source: row.source };
}

export function createPlanStore(deps: { readonly db: TrvDatabase; readonly clock: Clock }): PlanStore {
  const { db, clock } = deps;

  const newestVersion = (executor: Executor, tripId: string): number =>
    executor
      .select({ version: max(planVersions.versionNumber) })
      .from(planVersions)
      .where(eq(planVersions.tripId, tripId))
      .get()?.version ?? 0;

  const write = (tx: Executor, tripId: string, plan: PlanView, source: PlanVersionSource): SavedPlan => {
    const now = clock.now();
    const version = newestVersion(tx, tripId) + 1;
    const snapshot: PlanView = {
      currency: plan.currency,
      days: plan.days,
      stay: plan.stay,
      ...(plan.basis ? { basis: plan.basis } : {}),
    };
    tx.insert(planVersions)
      .values({ id: randomUUID(), tripId, versionNumber: version, source, planJson: JSON.stringify(snapshot), createdAt: now })
      .run();
    // Version numbers rise by one at a time, so everything at or below this line is beyond the newest ten.
    tx.delete(planVersions)
      .where(and(eq(planVersions.tripId, tripId), lte(planVersions.versionNumber, version - MAX_PLAN_VERSIONS)))
      .run();
    tx.update(trips).set({ status: 'Planned', updatedAt: now }).where(eq(trips.id, tripId)).run();
    return { ...snapshot, version, createdAt: now.toISOString(), source };
  };

  const save: PlanStore['save'] = (tripId, plan, source, within) =>
    within ? write(within, tripId, plan, source) : db.transaction((tx) => write(tx, tripId, plan, source));

  return {
    save,

    current(tripId) {
      const row = db
        .select()
        .from(planVersions)
        .where(eq(planVersions.tripId, tripId))
        .orderBy(desc(planVersions.versionNumber))
        .limit(1)
        .get();
      return row ? savedPlanOf(row) : null;
    },

    listVersions(tripId) {
      return db
        .select({ versionNumber: planVersions.versionNumber, createdAt: planVersions.createdAt, source: planVersions.source })
        .from(planVersions)
        .where(eq(planVersions.tripId, tripId))
        .orderBy(desc(planVersions.versionNumber))
        .all()
        .map((row) => ({ version: row.versionNumber, createdAt: row.createdAt.toISOString(), source: row.source }));
    },

    restore(tripId, version) {
      const row = db
        .select()
        .from(planVersions)
        .where(and(eq(planVersions.tripId, tripId), eq(planVersions.versionNumber, version)))
        .get();
      if (!row) return null;
      // Restoring what is already current would only repeat it, and enough repeats would push every older version out.
      return version === newestVersion(db, tripId) ? savedPlanOf(row) : save(tripId, savedPlanOf(row), 'restore');
    },
  };
}
