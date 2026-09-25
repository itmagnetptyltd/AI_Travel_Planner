import type { AdminMetrics } from '../../../shared/admin-metrics';
import type { AdminTripSummary } from '../../../shared/admin-trips';
import type { AnalysisBasis, FeedbackTheme } from '../../../shared/feedback-analysis';

export const averageRatingLabel = (average: number | null): string => (average === null ? 'No feedback yet' : average.toFixed(1));

export const usageCostLabel = (usd: number): string => `${usd.toFixed(2)} USD`;

/** One currency's average budget. Currencies are never added together (ANSWERS.md, "Currencies and conversion"). */
export const budgetLabel = (figure: AdminMetrics['averageBudget'][number]): string => `${figure.amount} ${figure.currency}`;

export const tripsSplitLabel = (trips: AdminMetrics['trips']): string => `${trips.total} (${trips.draft} Draft, ${trips.planned} Planned)`;

export function tripFeedbackLabel(feedback: AdminTripSummary['feedback']): string {
  if (!feedback) return 'No feedback';
  return feedback.comment ? `Rated ${feedback.rating}: ${feedback.comment}` : `Rated ${feedback.rating}`;
}

/** What an Administrator has typed or chosen to narrow the feedback by. Blank means "not filtered on". */
export interface FeedbackFilterForm {
  readonly keyword: string;
  readonly rating: string;
  readonly destination: string;
  readonly from: string;
  readonly to: string;
  readonly sort: string;
  readonly order: string;
}

export const EMPTY_FEEDBACK_FORM: FeedbackFilterForm = { keyword: '', rating: '', destination: '', from: '', to: '', sort: '', order: '' };

const FIELDS = ['keyword', 'rating', 'destination', 'from', 'to', 'sort', 'order'] as const satisfies readonly (keyof FeedbackFilterForm)[];

/** The filters as a query string, `?…`, holding only what was filled in; empty when nothing was. */
export function feedbackQuery(form: FeedbackFilterForm): string {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const value = form[field].trim();
    if (value !== '') params.set(field, value);
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

/** The address of the CSV of the list as filtered, so what is exported is what is on show. */
export const csvUrlFor = (form: FeedbackFilterForm): string => `/api/admin/feedback/export${feedbackQuery(form)}`;

/** What an analysis was made from, so an Administrator knows whether it covers every comment shown. */
export function analysisBasisLabel({ commentsAnalysed, commentsAvailable }: AnalysisBasis): string {
  const comments = (count: number) => `${count} ${count === 1 ? 'comment' : 'comments'}`;
  return commentsAnalysed === commentsAvailable ? `Based on ${comments(commentsAnalysed)}.` : `Based on the newest ${commentsAnalysed} of ${commentsAvailable} comments.`;
}

export const themeLabel = (theme: FeedbackTheme): string => `${theme.name}: ${theme.entries} ${theme.entries === 1 ? 'entry' : 'entries'}`;

