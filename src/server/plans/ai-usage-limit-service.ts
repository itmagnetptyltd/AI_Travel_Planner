import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { appSettings } from '../db/schema';
import { DEFAULT_DAILY_CHAT_LIMIT, DEFAULT_DAILY_PLAN_GENERATION_LIMIT } from '../../shared/ai-limits';

export interface AiUsageLimitService {
  /** How many Plan generations one Traveler may make per calendar day. */
  getDailyPlanGenerationLimit(): number;
  setDailyPlanGenerationLimit(limit: number): void;
  /** How many chat messages one Traveler may send per calendar day. */
  getDailyChatLimit(): number;
  setDailyChatLimit(limit: number): void;
}

const DAILY_PLAN_GENERATION_LIMIT_KEY = 'ai.dailyPlanGenerationLimit';
const DAILY_CHAT_LIMIT_KEY = 'ai.dailyChatLimit';

export function createAiUsageLimitService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): AiUsageLimitService {
  const { db, clock } = deps;

  /** The saved limit if it is a whole number above zero, otherwise the default. */
  const read = (key: string, fallback: number): number => {
    const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    const stored = row ? Number(JSON.parse(row.value)) : NaN;
    return Number.isInteger(stored) && stored > 0 ? stored : fallback;
  };

  const write = (key: string, limit: number): void => {
    const values = { key, value: JSON.stringify(limit), updatedAt: clock.now() };
    db.insert(appSettings)
      .values(values)
      .onConflictDoUpdate({ target: appSettings.key, set: { value: values.value, updatedAt: values.updatedAt } })
      .run();
  };

  return {
    getDailyPlanGenerationLimit: () => read(DAILY_PLAN_GENERATION_LIMIT_KEY, DEFAULT_DAILY_PLAN_GENERATION_LIMIT),
    setDailyPlanGenerationLimit: (limit) => write(DAILY_PLAN_GENERATION_LIMIT_KEY, limit),
    getDailyChatLimit: () => read(DAILY_CHAT_LIMIT_KEY, DEFAULT_DAILY_CHAT_LIMIT),
    setDailyChatLimit: (limit) => write(DAILY_CHAT_LIMIT_KEY, limit),
  };
}
