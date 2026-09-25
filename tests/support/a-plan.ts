import type { PlanActivity, PlanView } from '../../src/shared/plan-schemas';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A complete Plan of `days` Days from `startDate`. `label` makes one Plan tell apart from another. */
export function aPlanView(options: { readonly days?: number; readonly startDate?: string; readonly label?: string } = {}): PlanView {
  const { days = 8, startDate = '2026-10-10', label = 'Plan A' } = options;
  return {
    currency: 'USD',
    days: Array.from({ length: days }, (_, index) => ({
      dayNumber: index + 1,
      date: new Date(Date.parse(startDate) + index * DAY_MS).toISOString().slice(0, 10),
      activities: [
        {
          id: `${label}-day-${index + 1}-morning`,
          title: `${label} morning ${index + 1}`,
          startTime: '09:00',
          durationMinutes: 90,
          estimatedCost: 10,
          location: 'City centre',
          reason: `Reason for ${label} day ${index + 1}`,
          category: 'Activities',
          changedByHand: false,
        },
        {
          id: `${label}-day-${index + 1}-lunch`,
          title: `${label} lunch ${index + 1}`,
          startTime: '12:30',
          durationMinutes: 60,
          estimatedCost: 15,
          location: 'Old town',
          reason: 'A local favourite',
          category: 'Food',
          changedByHand: false,
        },
      ],
    })),
    stay: { accommodationType: 'Hotel', suggestedArea: 'City centre', nightlyCostEstimate: 150 },
    basis: { adults: 2, children: 2, budget: 5000 },
  };
}

/** The Plan with one Activity replaced by `change` applied to it, leaving every other Activity untouched. */
export function withActivityChanged(plan: PlanView, activityId: string, change: Partial<PlanActivity>): PlanView {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      activities: day.activities.map((activity) => (activity.id === activityId ? { ...activity, ...change } : activity)),
    })),
  };
}

export function activityIn(plan: PlanView, dayNumber: number, index: number): PlanActivity {
  const activity = plan.days.find((day) => day.dayNumber === dayNumber)?.activities[index];
  if (!activity) throw new Error(`Day ${dayNumber} has no Activity at position ${index}`);
  return activity;
}

/** Every Activity on every Day, as one list. */
export const allActivities = (plan: PlanView): readonly PlanActivity[] => plan.days.flatMap((day) => day.activities);
