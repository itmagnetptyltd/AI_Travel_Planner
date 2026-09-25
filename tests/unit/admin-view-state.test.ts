import { describe, expect, test } from 'vitest';
import {
  averageRatingLabel,
  budgetLabel,
  csvUrlFor,
  EMPTY_FEEDBACK_FORM,
  feedbackQuery,
  tripFeedbackLabel,
  tripsSplitLabel,
  usageCostLabel,
} from '../../src/web/pages/admin/admin-view-state';

describe('the words and figures on the admin pages', () => {
  // @covers REQ-TRV-069@v1
  test('shows an average rating of 4 as 4.0, and none as no feedback yet', () => {
    expect(averageRatingLabel(4)).toBe('4.0');
    expect(averageRatingLabel(4.3)).toBe('4.3');
    expect(averageRatingLabel(null)).toBe('No feedback yet');
  });

  // @covers REQ-TRV-069@v1
  test('shows an estimated cost of 1.5 as 1.50 USD', () => {
    expect(usageCostLabel(1.5)).toBe('1.50 USD');
    expect(usageCostLabel(0)).toBe('0.00 USD');
  });

  // @covers REQ-TRV-069@v1
  test('shows each currency\'s average budget on its own, never added to another', () => {
    expect(budgetLabel({ currency: 'USD', amount: 5000 })).toBe('5000 USD');
    expect(budgetLabel({ currency: 'AUD', amount: 3000 })).toBe('3000 AUD');
  });

  // @covers REQ-TRV-069@v1
  test('shows total trips 5 split as 2 Draft and 3 Planned', () => {
    expect(tripsSplitLabel({ total: 5, draft: 2, planned: 3 })).toBe('5 (2 Draft, 3 Planned)');
  });

  // @covers REQ-TRV-070@v1
  test('shows a Trip\'s feedback as its rating and comment, and says when there is none', () => {
    expect(tripFeedbackLabel({ rating: 4, comment: 'Day 2 too busy' })).toBe('Rated 4: Day 2 too busy');
    expect(tripFeedbackLabel({ rating: 5, comment: null })).toBe('Rated 5');
    expect(tripFeedbackLabel(null)).toBe('No feedback');
  });
});

describe('the feedback filters as they are sent', () => {
  // @covers REQ-TRV-065@v1
  test('send nothing for a form with nothing filled in', () => {
    expect(feedbackQuery(EMPTY_FEEDBACK_FORM)).toBe('');
  });

  // @covers REQ-TRV-065@v1
  test('send only what was filled in, with the keyword and Destination safely encoded', () => {
    const query = feedbackQuery({ ...EMPTY_FEEDBACK_FORM, keyword: 'too busy & hot', rating: '2', destination: 'Tokyo', from: '2026-09-15', to: '2026-10-15', sort: 'rating', order: 'asc' });

    expect(query).toBe('?keyword=too+busy+%26+hot&rating=2&destination=Tokyo&from=2026-09-15&to=2026-10-15&sort=rating&order=asc');
  });

  // @covers REQ-TRV-065@v1
  test('ignore space round a filter, so a stray space is not a filter', () => {
    expect(feedbackQuery({ ...EMPTY_FEEDBACK_FORM, keyword: '   ' })).toBe('');
  });

  // @covers REQ-TRV-065@v1
  test('export the same list that is on show: the CSV address carries the same filters', () => {
    const form = { ...EMPTY_FEEDBACK_FORM, keyword: 'busy', sort: 'rating', order: 'asc' };

    expect(csvUrlFor(form)).toBe(`/api/admin/feedback/export${feedbackQuery(form)}`);
    expect(csvUrlFor(EMPTY_FEEDBACK_FORM)).toBe('/api/admin/feedback/export');
  });
});
