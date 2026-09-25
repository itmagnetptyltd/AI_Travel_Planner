import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { feedback } from '../db/schema';
import type { PlanStore } from '../plans/plan-store';
import type { TripService } from '../trips/trip-service';
import type { FeedbackInput, FeedbackView } from '../../shared/feedback-schemas';
import type { TripView } from '../../shared/trip-schemas';

export type SaveResult =
  | { readonly ok: true; readonly feedback: FeedbackView }
  | { readonly ok: false; readonly error: 'not-found' | 'no-plan' };

export type LookupResult =
  | { readonly ok: true; readonly feedback: FeedbackView | null }
  | { readonly ok: false; readonly error: 'not-found' };

export interface FeedbackService {
  /**
   * Gives a Trip its one piece of feedback, or replaces it: the rating, the comment, the Plan version now current, the
   * Destination as it is now, and the date. Only for a Trip that has a Plan.
   */
  save(ownerId: string, tripId: string, input: FeedbackInput): SaveResult;
  /** The Trip's feedback, none if it has none. A Trip that is absent, deleted or someone else's reads as not found. */
  forTrip(ownerId: string, tripId: string): LookupResult;
}

type Row = typeof feedback.$inferSelect;

const viewOf = (row: Row, trip: Pick<TripView, 'id' | 'name'>): FeedbackView => ({
  id: row.id,
  rating: row.rating,
  comment: row.comment,
  planVersion: row.planVersion,
  trip: { id: trip.id, name: trip.name },
  destination: { name: row.destinationName, country: row.destinationCountry },
  updatedAt: row.updatedAt.toISOString(),
});

export function createFeedbackService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly trips: TripService;
  readonly store: PlanStore;
}): FeedbackService {
  const { db, clock, trips, store } = deps;
  const rowFor = (tripId: string): Row | undefined => db.select().from(feedback).where(eq(feedback.tripId, tripId)).get();

  return {
    save(ownerId, tripId, input) {
      const trip = trips.getForOwner(ownerId, tripId);
      if (!trip) return { ok: false, error: 'not-found' };
      const plan = store.current(tripId);
      if (!plan) return { ok: false, error: 'no-plan' };
      const now = clock.now();
      const values = {
        planVersion: plan.version,
        rating: input.rating,
        comment: input.comment,
        destinationName: trip.destination.name,
        destinationCountry: trip.destination.country,
        updatedAt: now,
      };
      db.insert(feedback)
        .values({ id: randomUUID(), tripId, createdAt: now, ...values })
        .onConflictDoUpdate({ target: feedback.tripId, set: values })
        .run();
      const saved = rowFor(tripId);
      if (!saved) throw new Error(`Feedback for Trip ${tripId} was not saved.`);
      return { ok: true, feedback: viewOf(saved, trip) };
    },

    forTrip(ownerId, tripId) {
      const trip = trips.getForOwner(ownerId, tripId);
      if (!trip) return { ok: false, error: 'not-found' };
      const row = rowFor(tripId);
      return { ok: true, feedback: row ? viewOf(row, trip) : null };
    },
  };
}
