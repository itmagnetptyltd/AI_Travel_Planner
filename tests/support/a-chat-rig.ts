import { createChatService } from '../../src/server/chat/chat-service';
import { createChatStore } from '../../src/server/chat/chat-store';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import { createPlanEditorService } from '../../src/server/plans/plan-editor-service';
import type { PlanGenerationSettings } from '../../src/server/plans/plan-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import type { PlanView } from '../../src/shared/plan-schemas';
import { aPlanWithShopping } from './a-chat-plan';
import { aDestination } from './a-destination';
import { aTripInput, anOwner, TODAY } from './a-trip';
import { aTestDatabase } from './build-test-app';
import { aFixedClock } from './fixed-clock';
import { anAiDouble } from './an-ai-double';

export const SETTINGS: PlanGenerationSettings = {
  timeoutMs: 1_000,
  destinationTextMaxChars: 2_000,
  maxOutputTokens: 8_000,
  inputCostMicroUsdPerMTok: 3_000_000,
  outputCostMicroUsdPerMTok: 15_000_000,
};

/** A Traveler whose Relaxed Trip to Kyoto holds a Plan with a shopping Activity on Day 3. */
export function aChatRig(options: { readonly plan?: PlanView } = {}) {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const ai = anAiDouble();
  const trips = createTripService({ db, clock });
  const limits = createAiUsageLimitService({ db, clock });
  const store = createPlanStore({ db, clock });
  const chat = createChatStore({ db, clock });
  const service = createChatService({ db, clock, ai, trips, limits, store, chat, settings: SETTINGS });
  const editor = createPlanEditorService({ trips, store });
  const ownerId = anOwner(db);
  const kyotoId = createDestinationService({ db, clock }).add(aDestination()).id;
  const created = trips.create(ownerId, aTripInput(kyotoId, { travelStyles: ['Relaxed'] }));
  if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
  const tripId = created.trip.id;
  const first = store.save(tripId, options.plan ?? aPlanWithShopping(), 'generation');
  return { db, clock, ai, trips, limits, store, chat, service, editor, ownerId, tripId, first };
}

export type Rig = ReturnType<typeof aChatRig>;
