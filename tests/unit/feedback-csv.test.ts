import { describe, expect, test } from 'vitest';
import { feedbackCsv } from '../../src/server/feedback/feedback-csv';
import type { AdminFeedbackView } from '../../src/shared/feedback-schemas';

const anEntry = (overrides: Partial<AdminFeedbackView> = {}): AdminFeedbackView => ({
  id: 'f-1',
  rating: 4,
  comment: 'Day 2 too busy',
  tripName: 'Tokyo Family Holiday',
  destination: { name: 'Tokyo', country: 'Japan' },
  date: '2026-10-01',
  planVersion: 2,
  ...overrides,
});

describe('the CSV of feedback', () => {
  // @covers REQ-TRV-065@v1
  test('has a heading row and one row for each entry, with its rating, comment, Destination and date', () => {
    const csv = feedbackCsv([anEntry(), anEntry({ rating: 2, comment: 'Far away', destination: { name: 'Paris', country: 'France' }, date: '2026-10-02' })]);

    expect(csv).toBe('Rating,Comment,Destination,Date\r\n4,Day 2 too busy,Tokyo,2026-10-01\r\n2,Far away,Paris,2026-10-02\r\n');
  });

  // @covers REQ-TRV-065@v1
  test('holds nothing else about the entry: no Trip, no Traveler, no identifier', () => {
    const csv = feedbackCsv([anEntry({ id: 'secret-id' })]);

    for (const other of ['Tokyo Family Holiday', 'secret-id', 'Japan']) expect(csv).not.toContain(other);
  });

  // @covers REQ-TRV-065@v1
  test('is only the heading when there is nothing to export', () => {
    expect(feedbackCsv([])).toBe('Rating,Comment,Destination,Date\r\n');
  });

  // @covers REQ-TRV-065@v1
  test('leaves an entry with no comment with an empty comment cell', () => {
    expect(feedbackCsv([anEntry({ comment: null })])).toBe('Rating,Comment,Destination,Date\r\n4,,Tokyo,2026-10-01\r\n');
  });

  // @covers REQ-TRV-065@v1
  test.each([
    ['a comma', 'Too busy, too hot', '"Too busy, too hot"'],
    ['a quote', 'The "old town" was closed', '"The ""old town"" was closed"'],
    ['a line break', 'Day 1\nDay 2', '"Day 1\nDay 2"'],
  ])('quotes a comment with %s so it stays in one cell', (_name, comment, cell) => {
    expect(feedbackCsv([anEntry({ comment })])).toBe(`Rating,Comment,Destination,Date\r\n4,${cell},Tokyo,2026-10-01\r\n`);
  });

  // @covers REQ-TRV-065@v1
  test.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd', '=HYPERLINK("http://evil.example","x")'])(
    'neutralises a comment that begins %j, so a spreadsheet cannot run it as a formula',
    (comment) => {
      const cell = feedbackCsv([anEntry({ comment })]).split('\r\n')[1]?.split(',')[1] ?? '';

      expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  // @covers REQ-TRV-065@v1
  test('neutralises a Destination name too, since an Administrator typed it and a spreadsheet does not know', () => {
    const csv = feedbackCsv([anEntry({ destination: { name: '=cmd|calc', country: 'Japan' } })]);

    expect(csv).toContain(",'=cmd|calc,");
  });

  // @covers REQ-TRV-065@v1
  test('does not neutralise a comment that only contains those characters, or a rating', () => {
    const csv = feedbackCsv([anEntry({ comment: 'Cost 5+5 = 10 @ the market', rating: 5 })]);

    expect(csv).toBe('Rating,Comment,Destination,Date\r\n5,Cost 5+5 = 10 @ the market,Tokyo,2026-10-01\r\n');
  });
});
