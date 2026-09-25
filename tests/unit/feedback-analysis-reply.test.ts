import { describe, expect, it } from 'vitest';
import { parseSummaryReply, parseThemesReply } from '../../src/server/feedback/feedback-analysis-reply';
import { FEEDBACK_SUMMARY_MAX_CHARS, MAX_THEMES } from '../../src/shared/feedback-analysis';

describe('the AI reply to a request for a summary', () => {
  // @covers REQ-TRV-066@v1
  it('is the text the AI wrote, without the space around it', () => {
    expect(parseSummaryReply('  Travelers found the schedules too busy.\n')).toEqual({ ok: true, summary: 'Travelers found the schedules too busy.' });
  });

  // @covers REQ-TRV-066@v1
  it.each([['nothing at all', ''], ['only space', '   \n  '], ['more than a summary can be', 'x'.repeat(FEEDBACK_SUMMARY_MAX_CHARS + 1)]])(
    'is refused when it is %s',
    (_name, text) => {
      expect(parseSummaryReply(text)).toEqual({ ok: false, problem: 'invalid' });
    },
  );

  // @covers REQ-TRV-066@v1
  it('may be exactly as long as a summary can be', () => {
    expect(parseSummaryReply('x'.repeat(FEEDBACK_SUMMARY_MAX_CHARS)).ok).toBe(true);
  });
});

describe('the AI reply to a request for themes', () => {
  const themes = (list: unknown) => JSON.stringify({ themes: list });

  // @covers REQ-TRV-067@v1
  it('counts the entries the AI named for a theme', () => {
    const result = parseThemesReply(themes([{ name: 'schedules are too busy', entries: [1, 3] }]), 3);

    expect(result).toEqual({ ok: true, themes: [{ name: 'schedules are too busy', entries: 2 }] });
  });

  // @covers REQ-TRV-067@v1
  it('counts an entry once however often the AI repeats it', () => {
    const result = parseThemesReply(themes([{ name: 'too busy', entries: [2, 2, 2, 1] }]), 3);

    expect(result).toEqual({ ok: true, themes: [{ name: 'too busy', entries: 2 }] });
  });

  // @covers REQ-TRV-067@v1
  it('ignores an entry number that was never sent, and drops a theme left with nothing', () => {
    const result = parseThemesReply(themes([{ name: 'real', entries: [1, 99, 0, -1] }, { name: 'imagined', entries: [42] }, { name: 'empty', entries: [] }]), 3);

    expect(result).toEqual({ ok: true, themes: [{ name: 'real', entries: 1 }] });
  });

  // @covers REQ-TRV-067@v1
  it('never uses a count the AI claims for itself', () => {
    const result = parseThemesReply(themes([{ name: 'too busy', count: 40, entries: [1, 2] }]), 3);

    expect(result).toEqual({ ok: true, themes: [{ name: 'too busy', entries: 2 }] });
  });

  // @covers REQ-TRV-067@v1
  it('puts the theme with most entries first, and orders equal ones by name', () => {
    const result = parseThemesReply(themes([{ name: 'b food', entries: [1] }, { name: 'a crowds', entries: [2] }, { name: 'c busy', entries: [1, 2, 3] }]), 3);

    expect(result.ok && result.themes.map((theme) => theme.name)).toEqual(['c busy', 'a crowds', 'b food']);
  });

  // @covers REQ-TRV-067@v1
  it('shows a theme name without line breaks or invisible direction and control characters', () => {
    const result = parseThemesReply(themes([{ name: 'too\nbusy‮​  days', entries: [1] }]), 1);

    expect(result).toEqual({ ok: true, themes: [{ name: 'too busy days', entries: 1 }] });
  });

  // @covers REQ-TRV-067@v1
  it('may name no theme at all', () => {
    expect(parseThemesReply(themes([]), 3)).toEqual({ ok: true, themes: [] });
  });

  // @covers REQ-TRV-067@v1
  it('finds the answer when the AI wraps it in other words', () => {
    const result = parseThemesReply(`Here you go:\n${themes([{ name: 'too busy', entries: [1] }])}\nAnything else?`, 1);

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-067@v1
  it.each([
    ['is not JSON', 'the themes are: busy'],
    ['has no themes list', JSON.stringify({ result: [] })],
    ['names a theme with no name', themes([{ name: '  ', entries: [1] }])],
    ['gives entries that are not numbers', themes([{ name: 'busy', entries: ['one'] }])],
    ['names more themes than anyone would read', themes(Array.from({ length: MAX_THEMES + 1 }, (_v, index) => ({ name: `t${index}`, entries: [1] })))],
  ])('is refused when it %s', (_name, text) => {
    expect(parseThemesReply(text, 3).ok).toBe(false);
  });
});
