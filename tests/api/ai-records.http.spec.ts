import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { accounts, aiRequests, auditLog } from '../../src/server/db/schema';
import type { AiRequestDetail, AiRequestSummary } from '../../src/server/plans/ai-record-service';
import { aConfirmedTravelerSession, anAddedDestination, anAdministratorSession, aTripInput, createdTrip, TODAY } from '../support/a-trip';
import { buildTestApp } from '../support/build-test-app';
import { anAiRequestRecord, DAY } from '../support/an-ai-request';

async function aPlanGeneratedToday() {
  const testApp = await buildTestApp({ now: TODAY });
  const destinationId = await anAddedDestination(testApp);
  const cookies = await aConfirmedTravelerSession(testApp);
  const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId));
  const generated = await testApp.app.inject({ method: 'POST', url: `/api/trips/${trip.id}/plan`, cookies });
  expect(generated.statusCode).toBe(201);
  const adminCookies = await anAdministratorSession(testApp);
  const listed = await testApp.app.inject({ method: 'GET', url: '/api/admin/ai-requests', cookies: adminCookies });
  const [record] = (listed.json() as { requests: AiRequestSummary[] }).requests;
  return { testApp, cookies, adminCookies, recordId: record?.id ?? '' };
}

describe('stored AI requests', () => {
  // @covers REQ-TRV-034@v1
  test('shows an Administrator the text sent to and returned by the AI for a Plan generated today', async () => {
    const { testApp, adminCookies, recordId } = await aPlanGeneratedToday();

    const response = await testApp.app.inject({
      method: 'GET',
      url: `/api/admin/ai-requests/${recordId}`,
      cookies: adminCookies,
    });

    expect(response.statusCode).toBe(200);
    const detail = response.json() as AiRequestDetail;
    expect(detail.requestText).toContain('Kyoto');
    expect(detail.replyText).toContain('"dayNumber"');
    expect(detail).toMatchObject({ kind: 'plan-generation', status: 'succeeded', inputTokens: 1000, outputTokens: 2000 });
  });

  // @covers REQ-TRV-034@v1
  test('lists requests to an Administrator without any AI text', async () => {
    const { testApp, adminCookies } = await aPlanGeneratedToday();

    const response = await testApp.app.inject({ method: 'GET', url: '/api/admin/ai-requests', cookies: adminCookies });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('Kyoto');
    expect(response.body).not.toContain('dayNumber');
  });

  // @covers REQ-TRV-034@v1
  test('returns 403 with no AI text to a logged-in Traveler who is not an Administrator', async () => {
    const { testApp, cookies, recordId } = await aPlanGeneratedToday();

    const list = await testApp.app.inject({ method: 'GET', url: '/api/admin/ai-requests', cookies });
    const one = await testApp.app.inject({ method: 'GET', url: `/api/admin/ai-requests/${recordId}`, cookies });

    expect([list.statusCode, one.statusCode]).toEqual([403, 403]);
    expect(list.body).not.toContain('Kyoto');
    expect(one.body).not.toContain('Kyoto');
    expect(one.body).not.toContain('dayNumber');
  });

  // @covers REQ-TRV-034@v1
  test('records the Administrator and the request in the audit log when a stored request is viewed', async () => {
    const { testApp, adminCookies, recordId } = await aPlanGeneratedToday();

    await testApp.app.inject({ method: 'GET', url: `/api/admin/ai-requests/${recordId}`, cookies: adminCookies });

    const administrator = testApp.db.select().from(accounts).where(eq(accounts.role, 'administrator')).get();
    expect(testApp.db.select().from(auditLog).where(eq(auditLog.action, 'ai-request.viewed')).all()).toEqual([
      expect.objectContaining({ actorAccountId: administrator?.id, subjectType: 'ai-request', subjectId: recordId }),
    ]);
  });

  // @covers REQ-TRV-034@v1
  test('returns 404 for a request that does not exist', async () => {
    const { testApp, adminCookies } = await aPlanGeneratedToday();

    const response = await testApp.app.inject({ method: 'GET', url: '/api/admin/ai-requests/nope', cookies: adminCookies });

    expect(response.statusCode).toBe(404);
  });
});

describe('expired AI text when the application starts', () => {
  // @covers REQ-TRV-034@v1
  test('is cleared, with its token counts and cost kept, before the first request', async () => {
    const { db } = await buildTestApp({
      now: TODAY,
      seed: (seeded) => {
        anAiRequestRecord(seeded, { createdAt: new Date(TODAY.getTime() - 31 * DAY) });
      },
    });

    const [row] = db.select().from(aiRequests).all();

    expect(row).toMatchObject({ requestText: null, replyText: null, inputTokens: 1_000, costMicroUsd: 33_000 });
  });
});
