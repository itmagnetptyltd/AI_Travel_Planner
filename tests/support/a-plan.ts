import type { PlanView } from '../../src/shared/plan-schemas';

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
          title: `${label} morning ${index + 1}`,
          startTime: '09:00',
          durationMinutes: 90,
          estimatedCost: 10,
          location: 'City centre',
          reason: `Reason for ${label} day ${index + 1}`,
          category: 'Activities',
        },
        {
          title: `${label} lunch ${index + 1}`,
          startTime: '12:30',
          durationMinutes: 60,
          estimatedCost: 15,
          location: 'Old town',
          reason: 'A local favourite',
          category: 'Food',
        },
      ],
    })),
    stay: { accommodationType: 'Hotel', suggestedArea: 'City centre', nightlyCostEstimate: 150 },
  };
}
