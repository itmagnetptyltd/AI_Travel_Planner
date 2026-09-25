import { describe, expect, test } from 'vitest';
import { FEEDBACK_DISCLOSURE, FEEDBACK_SAVED_MESSAGE, feedbackFailureMessage, ratingLabel } from '../../src/web/components/feedback-view-state';

describe('what a Traveler is told about their feedback', () => {
  // @covers REQ-TRV-062@v1
  test('is thanked, in a confirmation, when the feedback is saved', () => {
    expect(FEEDBACK_SAVED_MESSAGE).toBe('Thank you. Your feedback was saved.');
  });

  // @covers REQ-TRV-062@v1
  test('is asked for a rating from 1 to 5 when the rating is refused', () => {
    expect(feedbackFailureMessage({ code: 'VALIDATION_FAILED', field: 'rating' })).toBe('Choose a rating from 1 to 5.');
  });

  // @covers REQ-TRV-062@v1
  test('is told the comment is too long when the comment is refused, with the limit', () => {
    expect(feedbackFailureMessage({ code: 'VALIDATION_FAILED', field: 'comment' })).toBe('The comment can be at most 1,000 characters.');
  });

  // @covers REQ-TRV-062@v1
  test('is told to generate a Plan first when the Trip has none', () => {
    expect(feedbackFailureMessage({ code: 'PLAN_NOT_FOUND' })).toBe('Generate a Plan before giving feedback.');
  });

  // @covers REQ-TRV-062@v1
  test('is given plain words for anything else, so a failure is never silent', () => {
    expect(feedbackFailureMessage({ code: 'NETWORK', message: 'Could not reach the server. Try again.' })).toBe('Could not reach the server. Try again.');
    expect(feedbackFailureMessage({ code: 'INTERNAL_ERROR' })).toMatch(/could not be saved/i);
  });

  // @covers REQ-TRV-062@v1
  test('names each rating as stars', () => {
    expect([1, 2, 5].map(ratingLabel)).toEqual(['1 star', '2 stars', '5 stars']);
  });
});

describe('what a Traveler is told before they give feedback', () => {
  // @covers REQ-TRV-062@v1
  test('is that an Administrator can then open the Plan, to understand the feedback', () => {
    expect(FEEDBACK_DISCLOSURE).toMatch(/Administrator can open this Plan/);
    expect(FEEDBACK_DISCLOSURE).toMatch(/understand your feedback/);
  });
});
