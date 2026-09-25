import { describe, expect, test } from 'vitest';
import { aiRequests } from '../../src/server/db/schema';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE } from '../../src/shared/plan-schemas';
import { NOTHING_TO_ANALYSE, type FeedbackSummaryView, type FeedbackThemesView } from '../../src/shared/feedback-analysis';
import { aLoggedInTraveler } from '../support/a-traveler';
import { anAdminScenario } from '../support/an-admin-scenario';
import { commentsSentIn, themeOf } from '../support/an-analysis-setup';

const SUMMARY = 'Travelers mostly found the schedules too busy.';

/** Jane, a Traveler who has said her schedule was too busy, and a second Traveler who has said the same, and a third who praised the food. */
async function aScenarioWithThreeComments() {
  const scenario = await anAdminScenario();
  const jane = await scenario.aTraveler('traveler@example.com', { tripName: 'Jane Citizen’s honeymoon' });
  await scenario.feedbackFrom(jane, { rating: 2, comment: 'The schedule was too busy' });
  const second = await scenario.aTraveler('second@example.com');
  await scenario.feedbackFrom(second, { rating: 1, comment: 'Every day was too busy' });
  const third = await scenario.aTraveler('third@example.com');
  await scenario.feedbackFrom(third, { rating: 5, comment: 'Wonderful food' });
  return { ...scenario, jane };
}

/** What the AI was sent by the latest request. */
const lastSent = (scenario: Awaited<ReturnType<typeof aScenarioWithThreeComments>>) => scenario.testApp.ai.requests.at(-1);

describe('the Administrator asking the AI to summarise feedback through the API', () => {
  // @covers REQ-TRV-066@v1
  test('returns the summary the AI wrote', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(SUMMARY);

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ summary: SUMMARY, commentsAnalysed: 3, commentsAvailable: 3 } satisfies FeedbackSummaryView);
  });

  // @covers REQ-TRV-066@v1
  test('sends the AI the comments and neither the Traveler’s name, email address nor account identifier', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(SUMMARY);

    await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    const sent = `${lastSent(scenario)?.system}\n${lastSent(scenario)?.user}`;
    expect(sent).toContain('The schedule was too busy');
    expect(sent).not.toMatch(/Jane|Citizen|honeymoon|@example\.com/);
    expect(sent).not.toContain(scenario.jane.tripId);
  });

  // @covers REQ-TRV-066@v1
  test('analyses the feedback the filter in the request leaves', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(SUMMARY);

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', { rating: '5' });

    expect(commentsSentIn(lastSent(scenario)?.user ?? '').map(([, comment]) => comment)).toEqual(['Wonderful food']);
    expect(response.json()).toMatchObject({ commentsAnalysed: 1, commentsAvailable: 1 });
  });

  // @covers REQ-TRV-066@v1
  test('is refused, and the AI is not asked, for a Traveler and for someone not logged in', async () => {
    const scenario = await aScenarioWithThreeComments();
    const { cookies } = await aLoggedInTraveler(scenario.testApp.app, { email: 'plain@example.com' });
    const asked = scenario.testApp.ai.requests.length;

    const asTraveler = await scenario.testApp.app.inject({ method: 'POST', url: '/api/admin/feedback/summary', cookies, payload: {} });
    const asStranger = await scenario.testApp.app.inject({ method: 'POST', url: '/api/admin/feedback/summary', payload: {} });

    expect(asTraveler.statusCode).toBe(403);
    expect(asStranger.statusCode).toBe(401);
    expect(scenario.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-066@v1
  test('is refused naming the field when the filter is wrong, and the AI is not asked', async () => {
    const scenario = await aScenarioWithThreeComments();
    const asked = scenario.testApp.ai.requests.length;

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', { rating: '9' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'rating' });
    expect(scenario.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-066@v1
  test('answers 422 and does not ask the AI when there is no comment to analyse', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('quiet@example.com');
    await scenario.feedbackFrom(traveler, { rating: 4 });
    const asked = scenario.testApp.ai.requests.length;

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: NOTHING_TO_ANALYSE });
    expect(scenario.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-066@v1
  test('answers 503 with the standard message when the AI is unavailable, and shows no detail of the failure', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.failWith();

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
  });

  // @covers REQ-TRV-066@v1
  test('is recorded as an AI request that counts on the dashboard, and is not stored against any Trip', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(SUMMARY);
    const before = ((await scenario.asAdmin('GET', '/api/admin/metrics')).json() as { aiUsage: { requests: number } }).aiUsage.requests;

    await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    const after = ((await scenario.asAdmin('GET', '/api/admin/metrics')).json() as { aiUsage: { requests: number } }).aiUsage.requests;
    expect(after).toBe(before + 1);
    const stored = scenario.testApp.db.select().from(aiRequests).all().filter((row) => row.kind === 'feedback-summary');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tripId).toBeNull();
  });

  // @covers REQ-TRV-066@v1
  test('is not kept by browsers or proxies', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(SUMMARY);

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/summary', {});

    expect(response.headers['cache-control']).toContain('no-store');
  });
});

describe('the Administrator asking the AI for recurring themes through the API', () => {
  // @covers REQ-TRV-067@v1
  test('returns the theme "schedules are too busy" with the two entries counted against it', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(themeOf('schedules are too busy', 'too busy'));

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/themes', {});

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      themes: [{ name: 'schedules are too busy', entries: 2 }],
      commentsAnalysed: 3,
      commentsAvailable: 3,
    } satisfies FeedbackThemesView);
  });

  // @covers REQ-TRV-067@v1
  test('is refused for a Traveler, and the AI is not asked', async () => {
    const scenario = await aScenarioWithThreeComments();
    const { cookies } = await aLoggedInTraveler(scenario.testApp.app, { email: 'plain@example.com' });
    const asked = scenario.testApp.ai.requests.length;

    const response = await scenario.testApp.app.inject({ method: 'POST', url: '/api/admin/feedback/themes', cookies, payload: {} });

    expect(response.statusCode).toBe(403);
    expect(scenario.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-067@v1
  test('answers 503 with the standard message when the AI gives back something that is not themes', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith('I could not find any.');

    const response = await scenario.asAdmin('POST', '/api/admin/feedback/themes', {});

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: AI_UNAVAILABLE });
  });

  // @covers REQ-TRV-067@v1
  test('is recorded as a request for themes', async () => {
    const scenario = await aScenarioWithThreeComments();
    scenario.testApp.ai.replyWith(themeOf('schedules are too busy', 'too busy'));

    await scenario.asAdmin('POST', '/api/admin/feedback/themes', {});

    expect(scenario.testApp.db.select().from(aiRequests).all().filter((row) => row.kind === 'feedback-themes')).toHaveLength(1);
  });
});
