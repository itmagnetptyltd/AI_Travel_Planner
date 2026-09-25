import { desc, eq, lt } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { aiRequests } from '../db/schema';
import { recordAudit } from '../admin/audit-log';
import { AI_TEXT_RETENTION_DAYS, type AiRequestDetail, type AiRequestSummary } from '../../shared/ai-limits';

export type { AiRequestDetail, AiRequestSummary };

export interface AiRecordService {
  /** Clears request and reply text older than the retention period; counts and cost stay. Returns rows cleared. */
  purgeExpiredText(): number;
  list(): readonly AiRequestSummary[];
  /** Reads one record with its text and writes the audit entry naming the Administrator (REQ-TRV-034). */
  viewForAdmin(administratorId: string, id: string): AiRequestDetail | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = typeof aiRequests.$inferSelect;

const summaryOf = (row: Row): AiRequestSummary => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  kind: row.kind,
  status: row.status,
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  costMicroUsd: row.costMicroUsd,
});

export function createAiRecordService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): AiRecordService {
  const { db, clock } = deps;
  const retentionCutoff = () => new Date(clock.now().getTime() - AI_TEXT_RETENTION_DAYS * DAY_MS);

  return {
    purgeExpiredText() {
      return db
        .update(aiRequests)
        .set({ requestText: null, replyText: null })
        .where(lt(aiRequests.createdAt, retentionCutoff()))
        .run().changes;
    },

    list() {
      return db.select().from(aiRequests).orderBy(desc(aiRequests.createdAt)).all().map(summaryOf);
    },

    viewForAdmin(administratorId, id) {
      return db.transaction((tx) => {
        const row = tx.select().from(aiRequests).where(eq(aiRequests.id, id)).get();
        if (!row) return null;
        recordAudit(tx, clock, { actorAccountId: administratorId, action: 'ai-request.viewed', subjectId: id });
        const isExpired = row.createdAt < retentionCutoff();
        return {
          ...summaryOf(row),
          requestText: isExpired ? null : row.requestText,
          replyText: isExpired ? null : row.replyText,
        };
      });
    },
  };
}

/** Runs `task` now and every `everyMs`. A failure is reported, never thrown, so it cannot stop the server. */
export function schedulePurge(task: () => unknown, everyMs: number, onError: (error: unknown) => void): () => void {
  const purge = () => {
    try {
      task();
    } catch (error) {
      onError(error);
    }
  };
  purge();
  const timer = setInterval(purge, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** Clears expired AI text now and every `everyMs`. */
export function scheduleTextPurge(
  records: Pick<AiRecordService, 'purgeExpiredText'>,
  everyMs: number,
  onError: (error: unknown) => void,
): () => void {
  return schedulePurge(() => records.purgeExpiredText(), everyMs, onError);
}
