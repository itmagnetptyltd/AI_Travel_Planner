import type { SavedPlan } from '../../src/shared/plan-schemas';
import { aPlanReplyCosting, COSTS_TOTALLING_3200, type CostsByCategory } from './a-budget';
import { aTravelerWithATrip, generatePlan, type TravelerWithTrip } from './a-saved-plan-journey';

export type TravelerWithACostedPlan = TravelerWithTrip & { readonly plan: SavedPlan };

/** A Traveler whose Trip has an 8-Day Plan of exactly these costs (3200 USD in all unless told otherwise), generated through the API. */
export async function aTravelerWithACostedPlan(
  costs: CostsByCategory = COSTS_TOTALLING_3200,
  options: Parameters<typeof aTravelerWithATrip>[0] = {},
): Promise<TravelerWithACostedPlan> {
  const ready = await aTravelerWithATrip(options);
  ready.testApp.ai.replyWith(aPlanReplyCosting({ days: 8, nightly: 150, costs }));
  const generated = await generatePlan(ready);
  if (generated.statusCode !== 201) throw new Error(`Generating the Plan failed with ${generated.statusCode}`);
  return { ...ready, plan: generated.json() as SavedPlan };
}
