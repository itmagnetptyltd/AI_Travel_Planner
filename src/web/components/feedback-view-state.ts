import { FEEDBACK_COMMENT_MAX } from '../../shared/feedback-schemas';
import { PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import type { ApiError } from '../api-client';

export const FEEDBACK_SAVED_MESSAGE = 'Thank you. Your feedback was saved.';

/** Said beside the Save button: rating a Plan lets an Administrator open it (ANSWERS.md, "How much of a Traveler's Trip an Administrator may see"). */
export const FEEDBACK_DISCLOSURE = 'When you give feedback, an Administrator can open this Plan to understand your feedback. Each time they do, it is recorded.';

const PLAIN_FAILURE = 'Your feedback could not be saved. Try again.';

export const ratingLabel = (rating: number): string => `${rating} ${rating === 1 ? 'star' : 'stars'}`;

/** What to tell a Traveler whose feedback was refused, in words about what they can change. */
export function feedbackFailureMessage(error: Pick<ApiError, 'code' | 'message' | 'field'>): string {
  if (error.code === 'VALIDATION_FAILED' && error.field === 'rating') return 'Choose a rating from 1 to 5.';
  if (error.code === 'VALIDATION_FAILED' && error.field === 'comment') {
    return `The comment can be at most ${FEEDBACK_COMMENT_MAX.toLocaleString('en-US')} characters.`;
  }
  if (error.code === PLAN_NOT_FOUND) return 'Generate a Plan before giving feedback.';
  return error.message ?? PLAIN_FAILURE;
}
