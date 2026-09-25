/** Most comments one request to the AI carries, newest first, so a single click cannot send an unbounded prompt. */
export const FEEDBACK_ANALYSIS_MAX_ENTRIES = 100;

/** A summary longer than this is more than an Administrator will read, and is refused rather than cut. */
export const FEEDBACK_SUMMARY_MAX_CHARS = 2_000;
/** What the AI is asked to keep to: short of the limit, because a model that counts its own characters miscounts. */
export const FEEDBACK_SUMMARY_TARGET_CHARS = 1_500;

export const THEME_NAME_MAX_CHARS = 120;
export const MAX_THEMES = 20;

export const NOTHING_TO_ANALYSE = 'NOTHING_TO_ANALYSE';
export const NOTHING_TO_ANALYSE_MESSAGE = 'There are no comments to analyse.';

/** How many comments an analysis was made from, and how many there were: the two differ when the newest were taken. */
export interface AnalysisBasis {
  readonly commentsAnalysed: number;
  readonly commentsAvailable: number;
}

export interface FeedbackSummaryView extends AnalysisBasis {
  readonly summary: string;
}

/** A recurring theme, with the number of entries counted against it: worked out by the server, never claimed by the AI. */
export interface FeedbackTheme {
  readonly name: string;
  readonly entries: number;
}

export interface FeedbackThemesView extends AnalysisBasis {
  readonly themes: readonly FeedbackTheme[];
}
