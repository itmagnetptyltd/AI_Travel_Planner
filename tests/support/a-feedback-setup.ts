import type { TrvDatabase } from '../../src/server/db/client';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createAdminFeedbackService, type AdminFeedbackService } from '../../src/server/feedback/admin-feedback-service';
import { createFeedbackService, type FeedbackService } from '../../src/server/feedback/feedback-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import type { TripInput } from '../../src/shared/trip-schemas';
import { aDestination } from './a-destination';
import { aPlanView } from './a-plan';
import { aTripInput, anOwner, TODAY } from './a-trip';
import { aTestDatabase } from './build-test-app';
import { aFixedClock, type FixedClock } from './fixed-clock';

export interface FeedbackSetup {
  readonly db: TrvDatabase;
  readonly clock: FixedClock;
  readonly feedback: FeedbackService;
  readonly adminFeedback: AdminFeedbackService;
  readonly trips: ReturnType<typeof createTripService>;
  readonly store: ReturnType<typeof createPlanStore>;
  readonly destinations: ReturnType<typeof createDestinationService>;
  /** A Traveler account, written straight to the database. */
  readonly aTraveler: () => string;
  /** A saved Trip with a Plan at version 1, to `destination` (added if it is new). */
  readonly aTripWithAPlan: (options?: { owner?: string; destination?: string; name?: string; trip?: Partial<TripInput> }) => { tripId: string; ownerId: string };
  /** A Trip that has no Plan, so its status is Draft. */
  readonly aDraftTrip: (options?: { owner?: string; destination?: string; trip?: Partial<TripInput> }) => { tripId: string; ownerId: string };
  /** A new Traveler's Trip to `destination`, given `rating` and `comment` on the date `on` (the clock is moved there). */
  readonly giveFeedback: (options: { rating: number; comment?: string | null; destination?: string; on?: string }) => { tripId: string; ownerId: string };
  /** Saves another Plan version, as a regeneration does. */
  readonly regenerate: (tripId: string) => void;
}

/** A Traveler's Trips and the feedback service over a fresh database, with the clock at 2026-09-23 09:00 UTC. */
export function aFeedbackSetup(): FeedbackSetup {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const trips = createTripService({ db, clock });
  const store = createPlanStore({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const feedback = createFeedbackService({ db, clock, trips, store });
  const adminFeedback = createAdminFeedbackService({ db });
  const destinationIds = new Map<string, string>();

  const destinationId = (name: string): string => {
    const known = destinationIds.get(name);
    if (known) return known;
    const id = destinations.add(aDestination({ name, country: 'Japan' })).id;
    destinationIds.set(name, id);
    return id;
  };

  const createTrip = (owner: string, destination: string, name: string, trip: Partial<TripInput>): string => {
    const created = trips.create(owner, aTripInput(destinationId(destination), { name, ...trip }));
    if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
    return created.trip.id;
  };

  return {
    db,
    clock,
    feedback,
    adminFeedback,
    trips,
    store,
    destinations,
    aTraveler: () => anOwner(db),
    aTripWithAPlan: (options = {}) => {
      const ownerId = options.owner ?? anOwner(db);
      const tripId = createTrip(ownerId, options.destination ?? 'Tokyo', options.name ?? 'Tokyo Family Holiday', options.trip ?? {});
      store.save(tripId, aPlanView(), 'generation');
      return { tripId, ownerId };
    },
    aDraftTrip: (options = {}) => {
      const ownerId = options.owner ?? anOwner(db);
      return { tripId: createTrip(ownerId, options.destination ?? 'Tokyo', 'A Trip with no Plan', options.trip ?? {}), ownerId };
    },
    giveFeedback: (options) => {
      const ownerId = anOwner(db);
      const tripId = createTrip(ownerId, options.destination ?? 'Tokyo', 'Feedback trip', { startDate: '2027-01-10', endDate: '2027-01-12' });
      store.save(tripId, aPlanView(), 'generation');
      if (options.on) clock.advanceBy(Date.parse(`${options.on}T12:00:00Z`) - clock.now().getTime());
      feedback.save(ownerId, tripId, { rating: options.rating, comment: options.comment ?? null });
      return { tripId, ownerId };
    },
    regenerate: (tripId) => {
      store.save(tripId, aPlanView({ label: 'Regenerated' }), 'generation');
    },
  };
}
