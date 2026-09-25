import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { appSettings } from '../db/schema';
import { DEFAULT_DAILY_PLAN_GENERATION_LIMIT } from '../../shared/ai-limits';

export interface AiUsageLimitService {
  /** How many Plan generations one Traveler may make per calendar day. */
  getDailyPlanGenerationLimit(): number;
  setDailyPlanGenerationLimit(limit: number): void;
}

const DAILY_PLAN_GENERATION_LIMIT_KEY = 'ai.dailyPlanGenerationLimit';

export function createAiUsageLimitService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): AiUsageLimitService {
  const { db, clock } = deps;
  return {
    getDailyPlanGenerationLimit() {
      const row = db.select().from(appSettings).where(eq(appSettings.key, DAILY_PLAN_GENERATION_LIMIT_KEY)).get();
      const stored = row ? Number(JSON.parse(row.value)) : NaN;
      return Number.isInteger(stored) && stored > 0 ? stored : DEFAULT_DAILY_PLAN_GENERATION_LIMIT;
    },

    setDailyPlanGenerationLimit(limit) {
      const values = { key: DAILY_PLAN_GENERATION_LIMIT_KEY, value: JSON.stringify(limit), updatedAt: clock.now() };
      db.insert(appSettings)
        .values(values)
        .onConflictDoUpdate({ target: appSettings.key, set: { value: values.value, updatedAt: values.updatedAt } })
        .run();
    },
  };
}
