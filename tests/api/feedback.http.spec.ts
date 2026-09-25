import { describe, expect, test } from 'vitest';
import type { FeedbackView } from '../../src/shared/feedback-schemas';
import { aTravelerWithAPlan, regeneratePlanOf } from '../support/a-plan-edits';
import { aTravelerWithATrip } from '../support/a-saved-plan-journey';
import { aConfirmedTravelerSession } from '../support/a-trip';

type Ready = Awaited<ReturnType<typeof aTravelerWithAPlan>>;

const feedbackUrl = (ready: Pick<Ready, 'tripId'>) => `/api/trips/${ready.tripId}/feedback`;
const giveFeedback = (ready: Pick<Ready, 'testApp' | 'cookies' | 'tripId'>, payload: unknown, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'PUT', url: feedbackUrl(ready), cookies, payload: payload as object });
const readFeedback = (ready: Pick<Ready, 'testApp' | 'cookies' | 'tripId'>, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'GET', url: feedbackUrl(ready), cookies });
const feedbackOf = (response: { json(): unknown }) => response.json() as FeedbackView;

describe('giving feedback on a Trip through the API', () => {
  // @covers REQ-TRV-062@v1
  test('answers 200 for rating 4 and "Day 2 too busy", and reading it back shows both', async () => {
    const ready = await aTravelerWithAPlan();

    const saved = await giveFeedback(ready, { rating: 4, comment: 'Day 2 too busy' });

    expect(saved.statusCode).toBe(200);
    expect(feedbackOf(saved)).toMatchObject({ rating: 4, comment: 'Day 2 too busy' });
    expect(feedbackOf(await readFeedback(ready))).toMatchObject({ rating: 4, comment: 'Day 2 too busy' });
  });

  // @covers REQ-TRV-062@v1
  test('answers 404 PLAN_NOT_FOUND for a Draft Trip with no Plan, and stores none', async () => {
    const ready = await aTravelerWithATrip();

    const refused = await giveFeedback(ready, { rating: 4 });

    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ code: 'PLAN_NOT_FOUND' });
    expect((await readFeedback(ready)).statusCode).toBe(404);
  });

  // @covers REQ-TRV-062@v1
  test.each([
    ['rating 0', { rating: 0 }, 'rating'],
    ['rating 6', { rating: 6 }, 'rating'],
    ['a comment and no rating', { comment: 'Day 2 too busy' }, 'rating'],
    ['a comment of 1,001 characters', { rating: 3, comment: 'x'.repeat(1001) }, 'comment'],
    ['a field that is not feedback', { rating: 3, planVersion: 9 }, 'planVersion'],
  ])('answers 400 naming the field for %s, and stores nothing', async (_name, payload, field) => {
    const ready = await aTravelerWithAPlan();

    const refused = await giveFeedback(ready, payload);

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'VALIDATION_FAILED', field });
    expect((await readFeedback(ready)).statusCode).toBe(404);
  });

  // @covers REQ-TRV-062@v1
  test.each([{ rating: 3, comment: 'x'.repeat(1000) }, { rating: 3 }])('answers 200 for %j', async (payload) => {
    const ready = await aTravelerWithAPlan();

    expect((await giveFeedback(ready, payload)).statusCode).toBe(200);
  });

  // @covers REQ-TRV-062@v1
  test('leaves one entry, rated 5, when rating 2 is followed by rating 5', async () => {
    const ready = await aTravelerWithAPlan();
    await giveFeedback(ready, { rating: 2, comment: 'Too busy' });

    await giveFeedback(ready, { rating: 5 });

    expect(feedbackOf(await readFeedback(ready))).toMatchObject({ rating: 5, comment: null });
  });

  // @covers REQ-TRV-062@v1
  test('records Plan version 3 when the Plan is at version 3', async () => {
    const ready = await aTravelerWithAPlan();
    await regeneratePlanOf(ready);
    await regeneratePlanOf(ready);

    const saved = await giveFeedback(ready, { rating: 3 });

    expect(feedbackOf(saved).planVersion).toBe(3);
  });

  // @covers REQ-TRV-062@v1
  test('answers 401 to a caller who is not logged in, and the same 404 for another Traveler as for a Trip that does not exist', async () => {
    const ready = await aTravelerWithAPlan();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    expect((await giveFeedback(ready, { rating: 4 }, {})).statusCode).toBe(401);
    expect((await readFeedback(ready, {})).statusCode).toBe(401);
    const theirs = await giveFeedback(ready, { rating: 4 }, other);
    const missing = await ready.testApp.app.inject({ method: 'PUT', url: '/api/trips/no-such-trip/feedback', cookies: other, payload: { rating: 4 } });
    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toEqual(missing.json());
    expect((await readFeedback(ready)).statusCode).toBe(404);
  });
});

describe('what feedback is stored against, through the API', () => {
  // @covers REQ-TRV-063@v1
  test('names the Trip: "Tokyo Family Holiday"', async () => {
    const ready = await aTravelerWithAPlan();

    await giveFeedback(ready, { rating: 4, comment: 'Lovely' });

    expect(feedbackOf(await readFeedback(ready)).trip).toEqual({ id: ready.tripId, name: 'Tokyo Family Holiday' });
  });

  // @covers REQ-TRV-063@v1
  test('still identifies Plan version 2 after the Plan is regenerated to version 3', async () => {
    const ready = await aTravelerWithAPlan();
    await regeneratePlanOf(ready);
    await giveFeedback(ready, { rating: 4 });

    await regeneratePlanOf(ready);

    expect(feedbackOf(await readFeedback(ready)).planVersion).toBe(2);
  });
});
