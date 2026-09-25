import { describe, expect, test } from 'vitest';
import { FEEDBACK_COMMENT_MAX, feedbackInputSchema } from '../../src/shared/feedback-schemas';

const fieldRefused = (input: unknown): string | null => {
  const result = feedbackInputSchema.safeParse(input);
  if (result.success) return null;
  const issue = result.error.issues[0];
  return String(issue?.path[0] ?? (issue?.code === 'unrecognized_keys' ? issue.keys[0] : 'body'));
};

describe('the feedback a Traveler may give', () => {
  // @covers REQ-TRV-062@v1
  test('is a rating of 4 with the comment "Day 2 too busy"', () => {
    expect(feedbackInputSchema.parse({ rating: 4, comment: 'Day 2 too busy' })).toEqual({ rating: 4, comment: 'Day 2 too busy' });
  });

  // @covers REQ-TRV-062@v1
  test.each([1, 2, 3, 4, 5])('may be a rating of %i', (rating) => {
    expect(feedbackInputSchema.parse({ rating }).rating).toBe(rating);
  });

  // @covers REQ-TRV-062@v1
  test.each([0, 6, -1, 3.5, '4', null, undefined])('is refused, naming the rating, when the rating is %j', (rating) => {
    expect(fieldRefused({ rating, comment: 'fine' })).toBe('rating');
  });

  // @covers REQ-TRV-062@v1
  test('is refused, naming the rating, when there is a comment and no rating', () => {
    expect(fieldRefused({ comment: 'Day 2 too busy' })).toBe('rating');
  });

  // @covers REQ-TRV-062@v1
  test('is refused, naming the comment, when the comment is 1,001 characters', () => {
    expect(fieldRefused({ rating: 3, comment: 'x'.repeat(FEEDBACK_COMMENT_MAX + 1) })).toBe('comment');
  });

  // @covers REQ-TRV-062@v1
  test('may have a comment of exactly 1,000 characters', () => {
    expect(fieldRefused({ rating: 3, comment: 'x'.repeat(FEEDBACK_COMMENT_MAX) })).toBeNull();
    expect(FEEDBACK_COMMENT_MAX).toBe(1000);
  });

  // @covers REQ-TRV-062@v1
  test.each([{ rating: 3 }, { rating: 3, comment: '' }, { rating: 3, comment: '   \n ' }, { rating: 3, comment: null }])(
    'may have no comment, and a blank one is the same as none: %j',
    (input) => {
      expect(feedbackInputSchema.parse(input)).toEqual({ rating: 3, comment: null });
    },
  );

  // @covers REQ-TRV-062@v1
  test('does not count the space round a comment', () => {
    expect(fieldRefused({ rating: 3, comment: `  ${'x'.repeat(FEEDBACK_COMMENT_MAX)}  ` })).toBeNull();
  });

  // @covers REQ-TRV-062@v1
  test.each(['tripId', 'accountId', 'planVersion', 'destination'])('refuses a request that also sets %s, since only the Traveler chooses the rating and comment', (key) => {
    expect(fieldRefused({ rating: 3, [key]: 'anything' })).toBe(key);
  });
});
