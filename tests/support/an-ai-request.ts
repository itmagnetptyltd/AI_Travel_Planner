import { randomUUID } from 'node:crypto';
import type { TrvDatabase } from '../../src/server/db/client';
import { aiRequests } from '../../src/server/db/schema';

export const DAY = 24 * 60 * 60 * 1000;

/** One stored AI request, written straight to the database. */
export function anAiRequestRecord(
  db: TrvDatabase,
  overrides: Partial<typeof aiRequests.$inferInsert> & { readonly createdAt: Date },
): string {
  const id = overrides.id ?? randomUUID();
  db.insert(aiRequests)
    .values({
      id,
      accountId: 'an-account',
      tripId: 'a-trip',
      kind: 'plan-generation',
      status: 'succeeded',
      requestText: 'the text sent',
      replyText: 'the text returned',
      inputTokens: 1_000,
      outputTokens: 2_000,
      costMicroUsd: 33_000,
      ...overrides,
    })
    .run();
  return id;
}

/** `count` generations by one account at `when`, as if the Traveler had already made them. */
export function generationsAlreadyMade(db: TrvDatabase, accountId: string, count: number, when: Date): void {
  for (let made = 0; made < count; made += 1) {
    anAiRequestRecord(db, { accountId, createdAt: when });
  }
}
