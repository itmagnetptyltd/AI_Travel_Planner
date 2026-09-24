import { randomUUID } from 'node:crypto';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { auditLog } from '../db/schema';

export type AuditAction = 'account.promoted' | 'account.demoted' | 'account.disabled' | 'account.enabled';

/** Accepts the database or an open transaction, so an entry commits with the change it records. */
export function recordAudit(
  db: Pick<TrvDatabase, 'insert'>,
  clock: Clock,
  entry: { readonly actorAccountId: string; readonly action: AuditAction; readonly subjectId: string },
): void {
  db.insert(auditLog)
    .values({
      id: randomUUID(),
      actorAccountId: entry.actorAccountId,
      action: entry.action,
      subjectType: 'account',
      subjectId: entry.subjectId,
      occurredAt: clock.now(),
    })
    .run();
}
