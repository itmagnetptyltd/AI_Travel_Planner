import { randomUUID } from 'node:crypto';
import { parseCommentLine } from '../../src/server/feedback/feedback-analysis-prompt';
import { createFeedbackAnalysisService, type FeedbackAnalysisService } from '../../src/server/feedback/feedback-analysis-service';
import { accounts } from '../../src/server/db/schema';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import { aFeedbackSetup, type FeedbackSetup } from './a-feedback-setup';
import { anAiDouble, type AiDouble } from './an-ai-double';
import { TEST_PLAN_SETTINGS } from './build-test-app';
import { TODAY } from './a-trip';

export interface AnalysisSetup extends FeedbackSetup {
  readonly ai: AiDouble;
  readonly analysis: FeedbackAnalysisService;
  /** An Administrator account, written straight to the database. */
  readonly administratorId: string;
}

/** The feedback analysis over a fresh database and an AI double that records what it is sent. */
export function anAnalysisSetup(options: { readonly timeoutMs?: number } = {}): AnalysisSetup {
  const setup = aFeedbackSetup();
  const ai = anAiDouble();
  const administratorId = randomUUID();
  setup.db
    .insert(accounts)
    .values({
      id: administratorId,
      email: `${administratorId}@admin.example.com`,
      passwordHash: 'not-a-real-hash',
      role: 'administrator',
      emailConfirmedAt: TODAY,
      createdAt: TODAY,
    })
    .run();
  const analysis = createFeedbackAnalysisService({
    db: setup.db,
    clock: setup.clock,
    ai,
    limits: createAiUsageLimitService({ db: setup.db, clock: setup.clock }),
    feedback: setup.adminFeedback,
    settings: { ...TEST_PLAN_SETTINGS, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) },
  });
  return { ...setup, ai, analysis, administratorId };
}

/** The comment lines the AI was sent in its latest request: `[number, comment]`, in the order they were listed. */
export function commentsSentIn(user: string): [number, string][] {
  return user.split('\n').flatMap((line): [number, string][] => {
    const parsed = parseCommentLine(line);
    return parsed ? [[parsed.number, parsed.comment]] : [];
  });
}

/** An AI reply that names, as one theme, the entries whose comment contains `word`. */
export function themeOf(name: string, word: string): (request: { readonly user: string }) => string {
  return (request) => {
    const entries = commentsSentIn(request.user).filter(([, comment]) => comment.includes(word)).map(([number]) => number);
    return JSON.stringify({ themes: [{ name, entries }] });
  };
}
