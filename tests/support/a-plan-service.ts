import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import { createPlanService, type PlanGenerationSettings } from '../../src/server/plans/plan-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import { aDestination } from './a-destination';
import { aTripInput, anOwner, TODAY } from './a-trip';
import { aTestDatabase, TEST_PLAN_SETTINGS } from './build-test-app';
import { aFixedClock } from './fixed-clock';
import { anAiDouble, type AiDouble } from './an-ai-double';

/** The Plan service over a fresh database, with a Traveler and a Destination, and an AI double that records what it is asked. */
export function aPlanServiceRig(settings: Partial<PlanGenerationSettings> = {}, ai: AiDouble = anAiDouble()) {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const trips = createTripService({ db, clock });
  const limits = createAiUsageLimitService({ db, clock });
  const store = createPlanStore({ db, clock });
  const plans = createPlanService({ db, clock, ai, trips, limits, store, settings: { ...TEST_PLAN_SETTINGS, ...settings } });
  const ownerId = anOwner(db);
  const destinationId = createDestinationService({ db, clock }).add(aDestination()).id;

  const aTrip = (overrides: Parameters<typeof aTripInput>[1] = {}) => {
    const created = trips.create(ownerId, aTripInput(destinationId, overrides));
    if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
    return created.trip;
  };
  return { db, clock, ai, trips, store, plans, ownerId, aTrip };
}
