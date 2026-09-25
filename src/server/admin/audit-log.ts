import { randomUUID } from 'node:crypto';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { auditLog } from '../db/schema';

const SUBJECT_TYPE_OF_ACTION = {
  'account.promoted': 'account',
  'account.demoted': 'account',
  'account.disabled': 'account',
  'account.enabled': 'account',
  'ai-request.viewed': 'ai-request',
} as const;

export type AuditAction = keyof typeof SUBJECT_TYPE_OF_ACTION;

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
      subjectType: SUBJECT_TYPE_OF_ACTION[entry.action],
      subjectId: entry.subjectId,
      occurredAt: clock.now(),
    })
    .run();
}
