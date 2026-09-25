import type { PlanActivity, PlanView } from '../../src/shared/plan-schemas';
import { aPlanView } from './a-plan';

/** An 8-Day Plan whose Day 3 also holds a shopping Activity, for the chat requests that remove it. */
export function aPlanWithShopping(): PlanView {
  const plan = aPlanView({ days: 8 });
  const shopping: PlanActivity = {
    id: 'Plan A-day-3-shopping',
    title: 'Shopping at Nishiki market',
    startTime: '15:00',
    durationMinutes: 90,
    estimatedCost: 40,
    location: 'Nishiki market',
    reason: 'A covered market with local crafts.',
    category: 'Shopping',
    changedByHand: false,
  };
  return {
    ...plan,
    days: plan.days.map((day) => (day.dayNumber === 3 ? { ...day, activities: [...day.activities, shopping] } : day)),
  };
}

/** An Activity as the AI writes it back in a chat reply: the same fields, with no id and no mark. */
export const asChange = (activity: PlanActivity) => ({
  title: activity.title,
  startTime: activity.startTime,
  durationMinutes: activity.durationMinutes,
  estimatedCost: activity.estimatedCost,
  location: activity.location,
  reason: activity.reason,
  category: activity.category,
});
