import type { Currency } from '../../shared/currencies';
import { planNeedsReview } from '../../shared/plan-basis';
import {
  PLAN_LIMIT_REACHED,
  type PlanActivity,
  type PlanBasis,
  type PlanDay,
  type PlanVersionSummary,
  type SavedPlan,
  type WarnedPlanEffect,
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

/** An Activity's one-line heading: when it starts, then what it is. */
export const activityHeading = (activity: Pick<PlanActivity, 'startTime' | 'title'>): string => `${activity.startTime} ${activity.title}`;

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

const ORIGINS: Readonly<Record<PlanVersionSummary['source'], string>> = {
  generation: 'generated',
  restore: 'restored from an earlier version',
  edit: 'edited by you',
  'day-regeneration': 'one Day regenerated',
  'trip-change': 'changed with the Trip',
};

export function versionDetail(summary: PlanVersionSummary, isCurrent: boolean): string {
  const origin = ORIGINS[summary.source];
  return `saved ${utcText(summary.createdAt)}, ${origin}${isCurrent ? ' (current)' : ''}`;
}

export const planButtonLabel = (hasPlan: boolean): string => (hasPlan ? 'Regenerate Plan' : 'Generate Plan');

/** A Day with nothing on it is offered as Generate, not Regenerate: there is nothing to write again. */
export const dayButtonLabel = (day: PlanDay): string =>
  `${day.activities.length === 0 ? 'Generate' : 'Regenerate'} Day ${day.dayNumber}`;

/** `Day 4`, `Days 4 and 5`, `Days 6 to 8`, `Days 1, 3 and 6`. */
export function describeDays(days: readonly number[]): string {
  const [first] = days;
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return '';
  if (days.length === 1) return `Day ${first}`;
  if (days.length === 2) return `Days ${first} and ${last}`;
  const isRun = days.every((day, index) => day === first + index);
  if (isRun) return `Days ${first} to ${last}`;
  return `Days ${days.slice(0, -1).join(', ')} and ${last}`;
}

const RESTORABLE = 'The Plan you have now stays as an earlier version you can restore.';

/** Said before a Plan is written again over Activities the Traveler changed (REQ-TRV-041). */
export const editsWarning = (days: readonly number[]): string =>
  `You changed ${days.length > 0 ? `Activities on ${describeDays(days)}` : 'some Activities'} yourself. Regenerating replaces those changes. ${RESTORABLE}`;

/** Said before a change to a Trip alters its Plan (REQ-TRV-098). */
export function tripChangeWarning(effect: WarnedPlanEffect): string {
  if (effect.kind === 'regenerate') {
    return `Changing the Destination replaces the Plan with a new one for the new Destination. ${RESTORABLE}`;
  }
  return `Shortening the Trip means ${describeDays(effect.droppedDays)} will be dropped from the Plan. ${RESTORABLE}`;
}

const BANNER_TEXT =
  'The travelers or the budget of this Trip have changed since this Plan was made. You may want to regenerate the Plan or re-estimate its costs.';

/** The banner shown over a Plan the Trip has moved on from, or null when there is nothing to say. */
export const planBanner = (plan: { readonly basis?: PlanBasis | undefined }, trip: PlanBasis): string | null =>
  planNeedsReview(plan, trip) ? BANNER_TEXT : null;
