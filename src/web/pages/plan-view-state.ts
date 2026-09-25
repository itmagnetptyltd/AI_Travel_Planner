import type { Currency } from '../../shared/currencies';
import {
  PLAN_LIMIT_REACHED,
  type PlanActivity,
  type PlanDay,
  type PlanVersionSummary,
  type SavedPlan,
} from '../../shared/plan-schemas';
import type { ApiResult } from '../api-client';

export interface ActivityDetailRow {
  readonly label: string;
  readonly value: string;
}

const PLAIN_FAILURE = 'The Plan could not be generated. Try again.';

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


/** What the Trip's Plan section shows: the saved Plan, if there is one, and any message beside it. */
export interface PlanPanel {
  readonly plan: SavedPlan | null;
  readonly notice: { readonly kind: 'refused' | 'failed'; readonly message: string } | null;
  readonly isGenerating: boolean;
}

export const EMPTY_PLAN_PANEL: PlanPanel = { plan: null, notice: null, isGenerating: false };

/** The panel once a request that saves a Plan (generating, restoring) has answered. A failure never hides the saved Plan. */
export function panelAfterSave(previous: PlanPanel, result: ApiResult<SavedPlan>): PlanPanel {
  if (result.ok) return { plan: result.data, notice: null, isGenerating: false };
  const kind = result.error.code === PLAN_LIMIT_REACHED ? 'refused' : 'failed';
  return { plan: previous.plan, notice: { kind, message: result.error.message ?? PLAIN_FAILURE }, isGenerating: false };
}

export function versionLabel(summary: PlanVersionSummary): string {
  return `Version ${summary.version}`;
}

/** `2026-09-25T10:05:00.000Z` as `2026-09-25 10:05 UTC`, matching how the rest of the application states times. */
const utcText = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function versionDetail(summary: PlanVersionSummary, isCurrent: boolean): string {
  const origin = summary.source === 'restore' ? 'restored from an earlier version' : 'generated';
  return `saved ${utcText(summary.createdAt)}, ${origin}${isCurrent ? ' (current)' : ''}`;
}
