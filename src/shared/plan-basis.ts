import type { PlanBasis } from './plan-schemas';

/**
 * Whether the travelers or the budget of a Trip are no longer what its Plan was made for, so the Traveler
 * can be told to regenerate it or re-estimate its costs (REQ-TRV-098). A Plan saved before this was
 * recorded has no basis to compare with, so it is never flagged.
 */
export function planNeedsReview(plan: { readonly basis?: PlanBasis | undefined }, trip: PlanBasis): boolean {
  const { basis } = plan;
  return basis !== undefined && (basis.adults !== trip.adults || basis.children !== trip.children || basis.budget !== trip.budget);
}
