import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { accounts, destinations, feedback, trips } from '../db/schema';
import type { PlanStore } from '../plans/plan-store';
import { publicPlan } from '../plans/public-plan';
import { PLAN_RECOMMENDATION_NOTICE } from '../../shared/plan-notice';
import type { AdminPlanView, AdminTripSummary } from '../../shared/admin-trips';
import { estimatesOf } from '../../shared/trip-budget';
import { recordAudit } from './audit-log';

export type PlanForResult =
  | { readonly ok: true; readonly view: AdminPlanView }
  | { readonly ok: false; readonly error: 'not-found' | 'no-feedback' | 'no-plan' };

export interface AdminTripService {
  /** Every Traveler's Trip that is not deleted, newest first: a summary, never a Day or an Activity. */
  list(): readonly AdminTripSummary[];
  get(tripId: string): AdminTripSummary | null;
  /**
   * The Trip's Plan, only for a Trip that has feedback, so the feedback can be understood (ANSWERS.md, "How much of a
   * Traveler's Trip an Administrator may see"). The view is recorded in the audit log before the Plan is returned, so
   * it cannot happen unrecorded: if the entry cannot be written, no Plan is returned.
   */
  planFor(administratorId: string, tripId: string): PlanForResult;
}

export function createAdminTripService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly store: PlanStore;
  readonly audit?: typeof recordAudit;
}): AdminTripService {
  const { db, clock, store } = deps;
  const audit = deps.audit ?? recordAudit;

  const summaries = (where: SQL | undefined = undefined) =>
    db
      .select({
        id: trips.id,
        name: trips.name,
        ownerEmail: accounts.email,
        destinationName: destinations.name,
        destinationCountry: destinations.country,
        startDate: trips.startDate,
        endDate: trips.endDate,
        adults: trips.adults,
        children: trips.children,
        budget: trips.budget,
        currency: trips.currency,
        status: trips.status,
        rating: feedback.rating,
        comment: feedback.comment,
      })
      .from(trips)
      .innerJoin(accounts, eq(accounts.id, trips.ownerAccountId))
      .innerJoin(destinations, eq(destinations.id, trips.destinationId))
      .leftJoin(feedback, eq(feedback.tripId, trips.id))
      .where(and(isNull(trips.deletedAt), where))
      .orderBy(desc(trips.createdAt), asc(trips.id));

  const allRows = () => summaries().all();
  type Row = ReturnType<typeof allRows>[number];
  const summaryOf = (row: Row): AdminTripSummary => ({
    id: row.id,
    name: row.name,
    owner: { email: row.ownerEmail },
    destination: { name: row.destinationName, country: row.destinationCountry },
    startDate: row.startDate,
    endDate: row.endDate,
    numberOfTravelers: row.adults + row.children,
    budget: row.budget,
    currency: row.currency,
    status: row.status,
    feedback: row.rating === null ? null : { rating: row.rating, comment: row.comment },
  });

  const list = (): readonly AdminTripSummary[] => allRows().map(summaryOf);
  const one = (tripId: string): AdminTripSummary | null => {
    const row = summaries(eq(trips.id, tripId)).get();
    return row ? summaryOf(row) : null;
  };

  return {
    list,
    get: one,

    planFor(administratorId, tripId) {
      const trip = one(tripId);
      if (!trip) return { ok: false, error: 'not-found' };
      if (!trip.feedback) return { ok: false, error: 'no-feedback' };
      const plan = store.current(tripId);
      if (!plan) return { ok: false, error: 'no-plan' };
      audit(db, clock, { actorAccountId: administratorId, action: 'trip-plan.viewed', subjectId: tripId });
      return {
        ok: true,
        view: {
          trip: { name: trip.name, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate },
          plan: publicPlan(plan),
          estimates: estimatesOf(plan),
          notice: PLAN_RECOMMENDATION_NOTICE,
        },
      };
    },
  };
}
