import { describe, expect, test } from 'vitest';
import type { AdminMetrics } from '../../src/shared/admin-metrics';
import { aChatReplyText, acceptChange, activitiesOnDay, changeFor, messagesOf, sendChat } from '../support/a-chat';
import { aTravelerWithAShoppingPlan } from '../support/a-chat';
import { restoreVersion, versionsOf } from '../support/a-saved-plan-journey';
import { regeneratePlanOf } from '../support/a-plan-edits';
import { anAiRequestRecord } from '../support/an-ai-request';
import { anAdminScenario } from '../support/an-admin-scenario';
import { aLoggedInTraveler } from '../support/a-traveler';
import { anAdministratorSession } from '../support/a-trip';

const metricsOf = (response: { json(): unknown }) => response.json() as AdminMetrics;

describe('the usage metrics through the API', () => {
  // @covers REQ-TRV-069@v1
  test('show total users 3, total trips 5 and the split 2 Draft and 3 Planned for 3 Travelers and 5 Trips', async () => {
    const scenario = await anAdminScenario();
    const a = await scenario.aTraveler('a@example.com');
    await scenario.anotherTrip(a, { tripName: 'A second Plan' });
    const b = await scenario.aTraveler('b@example.com');
    await scenario.anotherTrip(b, { tripName: 'B draft', withPlan: false });
    await scenario.aTraveler('c@example.com', { withPlan: false });

    const metrics = metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics'));

    expect(metrics.users).toBe(3);
    expect(metrics.trips).toEqual({ total: 5, draft: 2, planned: 3 });
  });

  // @covers REQ-TRV-069@v1
  test('show feedback volume 4 with an average rating of 4.0 for feedback rated 5, 4, 3 and 4', async () => {
    const scenario = await anAdminScenario();
    for (const [index, rating] of [5, 4, 3, 4].entries()) {
      const traveler = await scenario.aTraveler(`t${index}@example.com`);
      await scenario.feedbackFrom(traveler, { rating });
    }

    expect(metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics')).feedback).toEqual({ count: 4, averageRating: 4 });
  });

  // @covers REQ-TRV-069@v1
  test('show generated itineraries 3 for a Plan generated once and regenerated twice, then changed by an accepted chat change and a restored version', async () => {
    const ready = await aTravelerWithAShoppingPlan();
    await regeneratePlanOf(ready);
    await regeneratePlanOf(ready);
    ready.testApp.ai.replyWith(aChatReplyText('Removed shopping.', [changeFor(3, activitiesOnDay(ready.plan, 3).filter((a) => a.category !== 'Shopping'))]));
    const proposal = messagesOf(await sendChat(ready, 'Remove the shopping')).find((message) => message.proposal);
    await acceptChange(ready, proposal?.id ?? '');
    const [, older] = await versionsOf(ready);
    await restoreVersion(ready, older?.version ?? 1);
    const admin = await anAdministratorSession(ready.testApp);

    const metrics = metricsOf(await ready.testApp.app.inject({ method: 'GET', url: '/api/admin/metrics', cookies: admin }));

    expect(metrics.generatedItineraries).toBe(3);
  });

  // @covers REQ-TRV-069@v1
  test('list 10 Destinations, ordered by number of Trips, for Trips to 12 different Destinations', async () => {
    const scenario = await anAdminScenario();
    for (let place = 1; place <= 12; place += 1) {
      await scenario.aTraveler(`t${place}@example.com`, { destination: `Place ${String(place).padStart(2, '0')}`, withPlan: false });
    }
    await scenario.aTraveler('extra@example.com', { destination: 'Place 12', withPlan: false });

    const { popularDestinations } = metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics'));

    expect(popularDestinations).toHaveLength(10);
    expect(popularDestinations[0]).toMatchObject({ name: 'Place 12', trips: 2 });
  });

  // @covers REQ-TRV-069@v1
  test('show average budget 5000 USD and 3000 AUD, and no combined figure, for budgets of 4000 USD, 6000 USD and 3000 AUD', async () => {
    const scenario = await anAdminScenario();
    await scenario.aTraveler('a@example.com', { withPlan: false, trip: { budget: 4000, currency: 'USD' } });
    await scenario.aTraveler('b@example.com', { withPlan: false, trip: { budget: 6000, currency: 'USD' } });
    await scenario.aTraveler('c@example.com', { withPlan: false, trip: { budget: 3000, currency: 'AUD' } });

    const { averageBudget } = metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics'));

    expect(averageBudget).toEqual([
      { currency: 'AUD', amount: 3000 },
      { currency: 'USD', amount: 5000 },
    ]);
  });

  // @covers REQ-TRV-069@v1
  test('show AI usage of 10 requests and 1.50 for the date range that holds them, and not the 5 outside it', async () => {
    const scenario = await anAdminScenario();
    for (let made = 0; made < 10; made += 1) anAiRequestRecord(scenario.testApp.db, { createdAt: new Date('2026-10-05T12:00:00Z'), costMicroUsd: 150_000 });
    for (let made = 0; made < 5; made += 1) anAiRequestRecord(scenario.testApp.db, { createdAt: new Date('2026-12-05T12:00:00Z'), costMicroUsd: 500_000 });

    const { aiUsage } = metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics?from=2026-10-01&to=2026-10-31'));

    expect(aiUsage).toEqual({ requests: 10, estimatedCost: 1.5, from: '2026-10-01', to: '2026-10-31' });
  });

  // @covers REQ-TRV-069@v1
  test('show all of the AI usage when no range is chosen', async () => {
    const scenario = await anAdminScenario();
    anAiRequestRecord(scenario.testApp.db, { createdAt: new Date('2026-10-05T12:00:00Z') });
    anAiRequestRecord(scenario.testApp.db, { createdAt: new Date('2026-12-05T12:00:00Z') });

    expect(metricsOf(await scenario.asAdmin('GET', '/api/admin/metrics')).aiUsage.requests).toBe(2);
  });

  // @covers REQ-TRV-069@v1
  test.each(['from=yesterday', 'to=2026-13-40', 'from=2026-10-31&to=2026-10-01', 'when=today'])('answers 400 for ?%s', async (query) => {
    const scenario = await anAdminScenario();

    expect((await scenario.asAdmin('GET', `/api/admin/metrics?${query}`)).statusCode).toBe(400);
  });

  // @covers REQ-TRV-069@v1
  test('answers 403 to a Traveler and 401 to someone not logged in', async () => {
    const { testApp } = await anAdminScenario();
    const { cookies } = await aLoggedInTraveler(testApp.app, { email: 'nosy@example.com' });

    expect((await testApp.app.inject({ method: 'GET', url: '/api/admin/metrics', cookies })).statusCode).toBe(403);
    expect((await testApp.app.inject({ method: 'GET', url: '/api/admin/metrics' })).statusCode).toBe(401);
  });
});
