import { requestTextOf, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { createAiCaller, type AiUnavailable } from '../plans/ai-call';
import type { AiUsageLimitService } from '../plans/ai-usage-limit-service';
import type { PlanPrompt } from '../plans/plan-prompt';
import type { PlanGenerationSettings } from '../plans/plan-service';
import type { AnalysisKind } from '../../shared/ai-limits';
import {
  FEEDBACK_ANALYSIS_MAX_ENTRIES,
  type AnalysisBasis,
  type FeedbackSummaryView,
  type FeedbackThemesView,
} from '../../shared/feedback-analysis';
import type { FeedbackFilter } from '../../shared/feedback-schemas';
import type { AdminFeedbackService } from './admin-feedback-service';
import { buildSummaryPrompt, buildThemesPrompt, type AnalysisEntry } from './feedback-analysis-prompt';
import { parseSummaryReply, parseThemesReply, type AnalysisReplyProblem } from './feedback-analysis-reply';

export type AnalysisResult<View> =
  | { readonly ok: true; readonly view: View }
  | { readonly ok: false; readonly error: 'nothing-to-analyse' }
  | AiUnavailable;

/** What the AI can be asked about the feedback an Administrator is looking at (REQ-TRV-066, REQ-TRV-067). */
export interface FeedbackAnalysisService {
  summarise(administratorId: string, filter: FeedbackFilter): Promise<AnalysisResult<FeedbackSummaryView>>;
  findThemes(administratorId: string, filter: FeedbackFilter): Promise<AnalysisResult<FeedbackThemesView>>;
}

type Interpreted<Part> = { readonly ok: true; readonly part: Part } | { readonly ok: false; readonly problem: AnalysisReplyProblem };

export function createFeedbackAnalysisService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly limits: AiUsageLimitService;
  readonly feedback: AdminFeedbackService;
  readonly settings: PlanGenerationSettings;
}): FeedbackAnalysisService {
  const caller = createAiCaller(deps);

  /** The comments to send: those the filter leaves, newest first whatever order was asked for, and no more than may be sent. */
  const entriesFor = (filter: FeedbackFilter): { readonly entries: readonly AnalysisEntry[]; readonly available: number } => {
    const commented = deps.feedback
      .list({ ...filter, sort: 'date', order: 'desc' })
      .flatMap(({ rating, comment, destination }) =>
        comment === null ? [] : [{ rating, comment, destination: `${destination.name}, ${destination.country}` }],
      );
    const entries = commented.slice(0, FEEDBACK_ANALYSIS_MAX_ENTRIES).map((entry, index) => ({ ...entry, number: index + 1 }));
    return { entries, available: commented.length };
  };

  async function analyse<Part>(
    kind: AnalysisKind,
    administratorId: string,
    filter: FeedbackFilter,
    ask: { readonly prompt: (entries: readonly AnalysisEntry[]) => PlanPrompt; readonly interpret: (text: string, entriesSent: number) => Interpreted<Part>; readonly what: string },
  ): Promise<AnalysisResult<Part & AnalysisBasis>> {
    const { entries, available } = entriesFor(filter);
    if (entries.length === 0) return { ok: false, error: 'nothing-to-analyse' };

    const prompt = ask.prompt(entries);
    const recordId = caller.record(kind, administratorId, requestTextOf(prompt));
    const answer = await caller.ask(recordId, prompt);
    if ('refusal' in answer) return answer.refusal;

    const interpreted = ask.interpret(answer.reply.text, entries.length);
    if (!interpreted.ok) {
      caller.settle(recordId, 'failed', answer.reply);
      return { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable ${ask.what} (${interpreted.problem}).` };
    }
    caller.settle(recordId, 'succeeded', answer.reply);
    return { ok: true, view: { ...interpreted.part, commentsAnalysed: entries.length, commentsAvailable: available } };
  }

  return {
    summarise: (administratorId, filter) =>
      analyse('feedback-summary', administratorId, filter, {
        prompt: buildSummaryPrompt,
        what: 'summary',
        interpret: (text): Interpreted<{ readonly summary: string }> => {
          const parsed = parseSummaryReply(text);
          return parsed.ok ? { ok: true, part: { summary: parsed.summary } } : parsed;
        },
      }),

    findThemes: (administratorId, filter) =>
      analyse('feedback-themes', administratorId, filter, {
        prompt: buildThemesPrompt,
        what: 'list of themes',
        interpret: (text, entriesSent): Interpreted<{ readonly themes: FeedbackThemesView['themes'] }> => {
          const parsed = parseThemesReply(text, entriesSent);
          return parsed.ok ? { ok: true, part: { themes: parsed.themes } } : parsed;
        },
      }),
  };
}
