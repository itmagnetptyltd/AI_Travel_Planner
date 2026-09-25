import { describe, expect, it } from 'vitest';
import { FEEDBACK_DISCLOSURE } from '../../src/web/components/feedback-view-state';
import { analysisBasisLabel, themeLabel } from '../../src/web/pages/admin/admin-view-state';

describe('how an analysis of feedback says what it is based on', () => {
  // @covers REQ-TRV-066@v1
  it.each([
    [{ commentsAnalysed: 12, commentsAvailable: 12 }, 'Based on 12 comments.'],
    [{ commentsAnalysed: 1, commentsAvailable: 1 }, 'Based on 1 comment.'],
    [{ commentsAnalysed: 100, commentsAvailable: 240 }, 'Based on the newest 100 of 240 comments.'],
  ])('reads %j as %j', (basis, expected) => {
    expect(analysisBasisLabel(basis)).toBe(expected);
  });
});

describe('how a recurring theme is worded', () => {
  // @covers REQ-TRV-067@v1
  it.each([
    [{ name: 'schedules are too busy', entries: 2 }, 'schedules are too busy: 2 entries'],
    [{ name: 'noisy hotels', entries: 1 }, 'noisy hotels: 1 entry'],
  ])('reads %j as %j', (theme, expected) => {
    expect(themeLabel(theme)).toBe(expected);
  });
});

describe('what a Traveler is told before giving feedback', () => {
  // @covers REQ-TRV-066@v1
  it('says an AI service may summarise comments, that the Traveler’s name and email address are not sent, and to keep personal details out of a comment', () => {
    expect(FEEDBACK_DISCLOSURE).toMatch(/AI service may (also )?summarise/i);
    expect(FEEDBACK_DISCLOSURE).toMatch(/your name and email address are not sent/i);
    expect(FEEDBACK_DISCLOSURE).toMatch(/do not write personal details/i);
  });

  // @covers REQ-TRV-066@v1
  it('still says an Administrator can open the Plan, and that each time is recorded', () => {
    expect(FEEDBACK_DISCLOSURE).toContain('an Administrator can open this Plan');
    expect(FEEDBACK_DISCLOSURE).toContain('it is recorded');
  });
});
