import { describe, expect, test } from 'vitest';
import { aiRequests, auditLog } from '../../src/server/db/schema';
import { createAiRecordService } from '../../src/server/plans/ai-record-service';
import { AI_TEXT_RETENTION_DAYS } from '../../src/shared/ai-limits';
import { TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';
import { anAiRequestRecord, DAY } from '../support/an-ai-request';

function aRecordService() {
  const db = aTestDatabase();
  const records = createAiRecordService({ db, clock: aFixedClock(TODAY) });
  return { db, records };
}

const daysAgo = (days: number) => new Date(TODAY.getTime() - days * DAY);

describe('keeping AI request and reply text', () => {
  // @covers REQ-TRV-034@v1
  test('clears the text of a request stored 31 days ago and keeps its token counts and cost', () => {
    const { db, records } = aRecordService();
    const id = anAiRequestRecord(db, { createdAt: daysAgo(31) });

    records.purgeExpiredText();

    const [row] = db.select().from(aiRequests).all();
    expect(row).toMatchObject({
      id,
      requestText: null,
      replyText: null,
      inputTokens: 1_000,
      outputTokens: 2_000,
      costMicroUsd: 33_000,
    });
  });

  // @covers REQ-TRV-034@v1
  test(`keeps the text of a request stored ${AI_TEXT_RETENTION_DAYS - 1} days ago`, () => {
    const { db, records } = aRecordService();
    anAiRequestRecord(db, { createdAt: daysAgo(AI_TEXT_RETENTION_DAYS - 1) });

    const cleared = records.purgeExpiredText();

    expect(cleared).toBe(0);
    expect(db.select().from(aiRequests).get()?.requestText).toBe('the text sent');
  });

  // @covers REQ-TRV-034@v1
  test('does not return text older than 30 days even before the purge has run', () => {
    const { db, records } = aRecordService();
    const id = anAiRequestRecord(db, { createdAt: daysAgo(31) });

    const detail = records.viewForAdmin('an-administrator', id);

    expect(detail).toMatchObject({ id, requestText: null, replyText: null, inputTokens: 1_000 });
  });
});

describe('an Administrator reading stored AI requests', () => {
  // @covers REQ-TRV-034@v1
  test('sees the text sent and returned for a request stored today', () => {
    const { db, records } = aRecordService();
    const id = anAiRequestRecord(db, { createdAt: TODAY });

    const detail = records.viewForAdmin('an-administrator', id);

    expect(detail).toMatchObject({ id, requestText: 'the text sent', replyText: 'the text returned' });
  });

  // @covers REQ-TRV-034@v1
  test('leaves an audit entry naming the Administrator and the request viewed', () => {
    const { db, records } = aRecordService();
    const id = anAiRequestRecord(db, { createdAt: TODAY });

    records.viewForAdmin('an-administrator', id);

    expect(db.select().from(auditLog).all()).toEqual([
      expect.objectContaining({
        actorAccountId: 'an-administrator',
        action: 'ai-request.viewed',
        subjectType: 'ai-request',
        subjectId: id,
      }),
    ]);
  });

  // @covers REQ-TRV-034@v1
  test('leaves no audit entry, and returns nothing, for a request that does not exist', () => {
    const { db, records } = aRecordService();

    expect(records.viewForAdmin('an-administrator', 'no-such-request')).toBeNull();
    expect(db.select().from(auditLog).all()).toEqual([]);
  });

  // @covers REQ-TRV-034@v1
  test('lists requests newest first without any text', () => {
    const { db, records } = aRecordService();
    const older = anAiRequestRecord(db, { createdAt: daysAgo(2) });
    const newer = anAiRequestRecord(db, { createdAt: daysAgo(1) });

    const listed = records.list();

    expect(listed.map((row) => row.id)).toEqual([newer, older]);
    expect(JSON.stringify(listed)).not.toContain('the text sent');
  });
});
