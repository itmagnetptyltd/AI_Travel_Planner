import { z } from 'zod';

/** ANSWERS.md, "Rating scale": 1 to 5 stars, required, with an optional comment of up to 1,000 characters. */
export const FEEDBACK_COMMENT_MAX = 1000;
export const FEEDBACK_MIN_RATING = 1;
export const FEEDBACK_MAX_RATING = 5;

export const FEEDBACK_NOT_FOUND = 'FEEDBACK_NOT_FOUND';

/**
 * What a Traveler sends: a rating and, if they like, a comment. Nothing else can be set, so the Trip, the Plan version and
 * the date are always the application's own. A comment that is blank is no comment.
 */
export const feedbackInputSchema = z
  .object({
    rating: z.number().int().min(FEEDBACK_MIN_RATING).max(FEEDBACK_MAX_RATING),
    comment: z
      .string()
      .trim()
      .max(FEEDBACK_COMMENT_MAX)
      .nullish()
      .transform((comment) => (comment ? comment : null)),
  })
  .strict();

export type FeedbackInput = z.output<typeof feedbackInputSchema>;

/** A Traveler's feedback on one of their own Trips, as the Web API returns it. */
export interface FeedbackView {
  readonly id: string;
  readonly rating: number;
  readonly comment: string | null;
  /** The Plan version that was current when the feedback was last saved. */
  readonly planVersion: number;
  readonly trip: { readonly id: string; readonly name: string };
  /** The Destination as it was when the feedback was saved. */
  readonly destination: { readonly name: string; readonly country: string };
  readonly updatedAt: string;
}

/** What an Administrator may do with feedback. Theme tagging is deliberately absent: it waits for the AI analysis release. */
export const ADMIN_FEEDBACK_ACTIONS = ['filter', 'sort', 'export'] as const;

export const FEEDBACK_SORTS = ['rating', 'date'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;

/** What an Administrator can narrow and order all feedback by. Every condition given must match; one left out matches everything. */
export interface FeedbackFilter {
  /** Anywhere in the comment, ignoring capitals. Taken as plain text. */
  readonly keyword?: string | undefined;
  readonly rating?: number | undefined;
  /** A Destination's name, ignoring capitals. */
  readonly destination?: string | undefined;
  /** UTC calendar dates, both included. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly sort?: (typeof FEEDBACK_SORTS)[number] | undefined;
  readonly order?: (typeof SORT_ORDERS)[number] | undefined;
}

const FILTER_TEXT_MAX = 100;
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** The filters as they arrive in a query string; a blank one is one not sent, and a wrong one is refused naming the field. */
export const feedbackFilterSchema = z
  .object({
    keyword: optional(z.string().trim().max(FILTER_TEXT_MAX)),
    rating: optional(z.string().regex(/^[1-5]$/).transform(Number)),
    destination: optional(z.string().trim().max(FILTER_TEXT_MAX)),
    from: optional(z.iso.date()),
    to: optional(z.iso.date()),
    sort: optional(z.enum(FEEDBACK_SORTS)),
    order: optional(z.enum(SORT_ORDERS)),
  })
  .strict()
  .superRefine((filter, context) => {
    if (filter.from !== undefined && filter.to !== undefined && filter.from > filter.to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'The end of the range is before its start.' });
    }
  });

/** One piece of feedback as an Administrator sees it: the feedback, its Trip's name if the Trip still exists, its Destination and date. */
export interface AdminFeedbackView {
  readonly id: string;
  readonly rating: number;
  readonly comment: string | null;
  /** Null once the Trip has been permanently deleted: nothing then identifies it. */
  readonly tripName: string | null;
  readonly destination: { readonly name: string; readonly country: string };
  /** The UTC date the feedback was last saved, `YYYY-MM-DD`. */
  readonly date: string;
  readonly planVersion: number;
}
