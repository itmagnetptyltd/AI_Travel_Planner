import type { FormEvent } from 'react';
import { FEEDBACK_COMMENT_MAX, FEEDBACK_MAX_RATING, FEEDBACK_MIN_RATING } from '../../shared/feedback-schemas';
import { FEEDBACK_DISCLOSURE, ratingLabel } from './feedback-view-state';
import { TextAreaField } from './TextAreaField';
import { useFeedback } from './use-feedback';

const RATINGS = Array.from({ length: FEEDBACK_MAX_RATING - FEEDBACK_MIN_RATING + 1 }, (_, index) => FEEDBACK_MIN_RATING + index);

/**
 * Rating a Trip's Plan, 1 to 5 stars with an optional comment (REQ-TRV-062). There is one piece of feedback for the Trip: the
 * form shows it when there is one, and saving replaces it. The result is announced, and a refusal is said in words. The Save
 * button is never disabled while it works, so keyboard focus stays on it; a second press is ignored instead.
 */
export function FeedbackPanel({ tripId }: { readonly tripId: string }) {
  const feedback = useFeedback(tripId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void feedback.save();
  };
  return (
    <section aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">Rate this Plan</h2>
      {feedback.isLoaded ? (
        <form onSubmit={submit} noValidate>
          <fieldset className="choice-group">
            <legend>Rating</legend>
            {RATINGS.map((rating) => (
              <label key={rating} className="choice">
                <input type="radio" name="rating" value={rating} checked={feedback.rating === rating} onChange={() => feedback.setRating(rating)} />
                {ratingLabel(rating)}
              </label>
            ))}
          </fieldset>
          <TextAreaField label="Comment (optional)" value={feedback.comment} onChange={feedback.setComment} maxLength={FEEDBACK_COMMENT_MAX} />
          <p className="hint">{FEEDBACK_DISCLOSURE}</p>
          <button type="submit" aria-disabled={feedback.isSaving}>
            Save feedback
          </button>
        </form>
      ) : (
        <p className="muted">Loading your feedback…</p>
      )}
      <div aria-live="polite">{feedback.notice && !feedback.notice.isError ? feedback.notice.text : ''}</div>
      {feedback.notice?.isError ? <p role="alert">{feedback.notice.text}</p> : null}
    </section>
  );
}
