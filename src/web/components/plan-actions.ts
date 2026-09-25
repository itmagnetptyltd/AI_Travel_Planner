import type { PlanActivity } from '../../shared/plan-schemas';

/** An Activity the AI suggested to replace another: shown to the Traveler, and saved only if they accept it. */
export type SuggestedActivity = Pick<PlanActivity, 'title' | 'startTime' | 'durationMinutes' | 'estimatedCost' | 'location' | 'reason' | 'category'>;

/** What a Traveler can do to a Plan on show. Each returns a message for the Traveler when it did not work, or null when it did. */
export interface PlanActions {
  /** True while any request is under way, so two cannot be started at once. */
  readonly isBusy: boolean;
  readonly onRegenerateDay: (dayNumber: number) => void;
  readonly onEdit: (activityId: string, changes: Record<string, string | number>) => Promise<string | null>;
  readonly onRemove: (activityId: string) => Promise<string | null>;
  readonly onMove: (activityId: string, toDay: number) => Promise<string | null>;
  readonly onReplace: (activityId: string, activity: Record<string, string | number | boolean>) => Promise<string | null>;
  readonly onSuggest: (
    activityId: string,
  ) => Promise<{ readonly ok: true; readonly activity: SuggestedActivity } | { readonly ok: false; readonly problem: string }>;
}
