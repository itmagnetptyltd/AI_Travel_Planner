import { z } from 'zod';
import { FEEDBACK_SUMMARY_MAX_CHARS, MAX_THEMES, THEME_NAME_MAX_CHARS, type FeedbackTheme } from '../../shared/feedback-analysis';
import { jsonIn } from '../plans/plan-reply';

export type AnalysisReplyProblem = 'not-json' | 'invalid';

export type SummaryReplyResult = { readonly ok: true; readonly summary: string } | { readonly ok: false; readonly problem: AnalysisReplyProblem };
export type ThemesReplyResult = { readonly ok: true; readonly themes: readonly FeedbackTheme[] } | { readonly ok: false; readonly problem: AnalysisReplyProblem };

/** The AI's summary, as written. A reply that is empty, or longer than a summary may be, is refused, never cut or repaired. */
export function parseSummaryReply(text: string): SummaryReplyResult {
  const summary = text.trim();
  return summary === '' || summary.length > FEEDBACK_SUMMARY_MAX_CHARS ? { ok: false, problem: 'invalid' } : { ok: true, summary };
}

const themesSchema = z.object({
  themes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(THEME_NAME_MAX_CHARS),
        entries: z.array(z.number().int()),
      }),
    )
    .max(MAX_THEMES),
});

/**
 * The themes the AI found. It says which entries raise each theme, and the count is the server's own: the entries it named
 * that were really sent, each counted once. A theme left with no entry is dropped. Whatever else the reply claims is not read.
 */
export function parseThemesReply(text: string, entriesSent: number): ThemesReplyResult {
  const raw = jsonIn(text);
  if (raw === undefined) return { ok: false, problem: 'not-json' };
  const parsed = themesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  const themes = parsed.data.themes
    .map((theme) => ({
      name: theme.name.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim(),
      entries: new Set(theme.entries.filter((number) => number >= 1 && number <= entriesSent)).size,
    }))
    .filter((theme) => theme.entries > 0)
    .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name));
  return { ok: true, themes };
}
