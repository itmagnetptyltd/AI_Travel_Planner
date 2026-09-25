import type { Currency } from '../../shared/currencies';
import { PLAN_LIMIT_REACHED, type PlanActivity, type PlanDay, type PlanView } from '../../shared/plan-schemas';
import type { ApiResult } from '../api-client';

export type PlanState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'generating' }
  | { readonly kind: 'shown'; readonly plan: PlanView }
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

export interface ActivityDetailRow {
  readonly label: string;
  readonly value: string;
}

const PLAIN_FAILURE = 'The Plan could not be generated. Try again.';

/** What the Trip page shows once a request for a Plan has answered. */
export function planStateAfter(result: ApiResult<PlanView>): PlanState {
  if (result.ok) return { kind: 'shown', plan: result.data };
  if (result.error.code === PLAN_LIMIT_REACHED) {
    return { kind: 'refused', message: result.error.message ?? PLAIN_FAILURE };
  }
  return { kind: 'failed', message: result.error.message ?? PLAIN_FAILURE };
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [hours > 0 ? `${hours} h` : null, rest > 0 ? `${rest} min` : null];
  return parts.filter((part) => part !== null).join(' ');
}

export function costLabel(cost: number, currency: Currency): string {
  return `${cost} ${currency} (an estimate, not a price)`;
}

export function dayHeading(day: PlanDay): string {
  return `Day ${day.dayNumber}, ${day.date}`;
}

/** The facts REQ-TRV-044 says an opened Activity shows, in the order it shows them. */
export function activityDetailRows(activity: PlanActivity, currency: Currency): readonly ActivityDetailRow[] {
  return [
    { label: 'Time', value: activity.startTime },
    { label: 'Duration', value: durationLabel(activity.durationMinutes) },
    { label: 'Estimated cost', value: costLabel(activity.estimatedCost, currency) },
    { label: 'Location', value: activity.location },
    { label: 'Why it was recommended', value: activity.reason },
  ];
}

