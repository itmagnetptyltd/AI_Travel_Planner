import { ACTIVITY_CATEGORIES, type ActivityCategory, type PlanActivity, type PlanView } from '../../src/shared/plan-schemas';
import { aPlanReplyText } from './a-plan-reply';

/** What each category holds: one Activity per number, in order. A plain number is one Activity. */
export type CostsByCategory = Partial<Record<ActivityCategory, number | readonly number[]>>;

interface Costing {
  readonly days?: number;
  readonly nightly?: number;
  readonly costs?: CostsByCategory;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const amountsOf = (value: number | readonly number[] | undefined): readonly number[] =>
  value === undefined ? [] : typeof value === 'number' ? [value] : value;

/** Day 1's Activities: one per amount, titled `Food 1`, `Food 2`, and so on. Every other Day holds one free walk. */
export function costedActivities(costs: CostsByCategory): PlanActivity[] {
  const given: readonly ActivityCategory[] = ACTIVITY_CATEGORIES.filter((category) => costs[category] !== undefined);
  return given.flatMap((category, categoryIndex) =>
    amountsOf(costs[category]).map((estimatedCost, index) => ({
      id: `${category}-${index + 1}`,
      title: `${category} ${index + 1}`,
      startTime: `${String(8 + categoryIndex).padStart(2, '0')}:${String(index * 10).padStart(2, '0')}`,
      durationMinutes: 60,
      estimatedCost,
      location: 'City centre',
      reason: 'Costed for a test.',
      category,
      changedByHand: false,
    })),
  );
}

const FREE_WALK: PlanActivity = {
  id: 'free-walk',
  title: 'Free walk',
  startTime: '20:00',
  durationMinutes: 30,
  estimatedCost: 0,
  location: 'City centre',
  reason: 'Costs nothing.',
  category: 'Other',
  changedByHand: false,
};

/** A Plan of `days` Days (8 by default) in USD whose costs are exactly those given, all on Day 1. */
export function aPlanCosting({ days = 8, nightly = 150, costs = {} }: Costing = {}): PlanView {
  return {
    currency: 'USD',
    days: Array.from({ length: days }, (_, index) => ({
      dayNumber: index + 1,
      date: new Date(Date.parse('2026-10-10') + index * DAY_MS).toISOString().slice(0, 10),
      activities: index === 0 ? [...costedActivities(costs), { ...FREE_WALK, id: 'free-walk-1' }] : [{ ...FREE_WALK, id: `free-walk-${index + 1}` }],
    })),
    stay: { accommodationType: 'Hotel', suggestedArea: 'City centre', nightlyCostEstimate: nightly },
    basis: { adults: 2, children: 2, budget: 5000 },
  };
}

/** The JSON the AI double answers a Plan request with, for the same costs as `aPlanCosting`. */
export function aPlanReplyCosting({ days = 8, nightly = 150, costs = {} }: Costing = {}): string {
  const free = { title: 'Free walk', startTime: '20:00', durationMinutes: 30, estimatedCost: 0, location: 'City centre', reason: 'Costs nothing.', category: 'Other' as const };
  return aPlanReplyText({
    stay: { nightlyCostEstimate: nightly },
    days: Array.from({ length: days }, (_, index) => ({
      dayNumber: index + 1,
      activities: index === 0 ? [...costedActivities(costs), free] : [free],
    })),
  });
}

/** Costs whose Plan totals 5600 with 150 a night for 8 Days: 1050 + 1500 + 1000 + 1300 + 500 + 250. */
export const COSTS_TOTALLING_5600: CostsByCategory = { Food: 1500, Transportation: 1000, Activities: 1300, Shopping: 500, Other: 250 };
