import type { PlanView } from '../../shared/plan-schemas';
import type { SharedPlanView } from '../../shared/share-schemas';

/** The Plan as a public link shows it: no ids and no marks of who edited what. */
export function publicPlan(plan: PlanView): SharedPlanView['plan'] {
  return {
    currency: plan.currency,
    stay: plan.stay,
    days: plan.days.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date,
      activities: day.activities.map((activity) => ({
        startTime: activity.startTime,
        title: activity.title,
        durationMinutes: activity.durationMinutes,
        estimatedCost: activity.estimatedCost,
        location: activity.location,
        reason: activity.reason,
        category: activity.category,
      })),
    })),
  };
}
