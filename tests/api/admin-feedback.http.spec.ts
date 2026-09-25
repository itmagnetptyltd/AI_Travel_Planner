import { describe, expect, test } from 'vitest';
import { createTripService } from '../../src/server/trips/trip-service';
import type { AdminFeedbackView } from '../../src/shared/feedback-schemas';
import { TRIP_RESTORE_DAYS } from '../../src/shared/trip-schemas';
import { DAY } from '../support/a-day';
import { anAdminScenario } from '../support/an-admin-scenario';
import { aLoggedInTraveler } from '../support/a-traveler';

const listOf = (response: { json(): unknown }) => (response.json() as { feedback: AdminFeedbackView[] }).feedback;

async function aScenarioWithFiveEntries() {
  const scenario = await anAdminScenario();
  const rows: [string, string, number, string][] = [
    ['a@example.com', 'Tokyo', 3, 'Day 2 too busy'],
    ['b@example.com', 'Tokyo', 2, 'Far too busy everywhere'],
    ['c@example.com', 'Paris', 4, 'Busy but lovely'],
    ['d@example.com', 'Paris', 5, 'Wonderful'],
    ['e@example.com', 'Tokyo', 4, 'Quiet and calm'],
  ];
  for (const [email, destination, rating, comment] of rows) {
    const traveler = await scenario.aTraveler(email, { destination, tripName: `${destination} trip` });
    await scenario.feedbackFrom(traveler, { rating, comment });
  }
  return scenario;
}

describe('the Administrator reviewing feedback through the API', () => {
  // @covers REQ-TRV-064@v1
  test('lists two Travelers\' feedback, each with its rating, comment and Trip', async () => {
    const scenario = await anAdminScenario();
    const first = await scenario.aTraveler('first@example.com', { tripName: 'First trip' });
    const second = await scenario.aTraveler('second@example.com', { tripName: 'Second trip' });
    await scenario.feedbackFrom(first, { rating: 4, comment: 'Day 2 too busy' });
    await scenario.feedbackFrom(second, { rating: 2, comment: 'Hotel was far away' });

    const response = await scenario.asAdmin('GET', '/api/admin/feedback');

    expect(response.statusCode).toBe(200);
    expect(listOf(response).map((entry) => [entry.rating, entry.comment, entry.tripName]).sort()).toEqual([
      [2, 'Hotel was far away', 'Second trip'],
      [4, 'Day 2 too busy', 'First trip'],
    ]);
  });

  // @covers REQ-TRV-064@v1
  test('shows no Traveler: not an account, an email address or an identifier', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('private@example.com');
    await scenario.feedbackFrom(traveler, { rating: 4, comment: 'Lovely' });

    const response = await scenario.asAdmin('GET', '/api/admin/feedback');

    expect(response.body).not.toContain('private@example.com');
    expect(response.body).not.toContain(traveler.tripId);
  });

  // @covers REQ-TRV-064@v1
  test('answers 403 to a Traveler and 401 to someone not logged in', async () => {
    const { testApp } = await anAdminScenario();
    const { cookies } = await aLoggedInTraveler(testApp.app, { email: 'plain@example.com' });

    expect((await testApp.app.inject({ method: 'GET', url: '/api/admin/feedback', cookies })).statusCode).toBe(403);
    expect((await testApp.app.inject({ method: 'GET', url: '/api/admin/feedback/export', cookies })).statusCode).toBe(403);
    expect((await testApp.app.inject({ method: 'GET', url: '/api/admin/feedback' })).statusCode).toBe(401);
  });
});

describe('finding what recurs, through the API', () => {
  // @covers REQ-TRV-065@v1
  test('lists exactly the entries whose comments contain the keyword "busy"', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    const list = listOf(await asAdmin('GET', '/api/admin/feedback?keyword=busy'));

    expect(list.map((entry) => entry.comment).sort()).toEqual(['Busy but lovely', 'Day 2 too busy', 'Far too busy everywhere']);
  });

  // @covers REQ-TRV-065@v1
  test('lists only the entry rated 2, and only the Tokyo feedback, when filtered by rating 2 or by Destination Tokyo', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    expect(listOf(await asAdmin('GET', '/api/admin/feedback?rating=2')).map((entry) => entry.rating)).toEqual([2]);
    const tokyo = listOf(await asAdmin('GET', '/api/admin/feedback?destination=Tokyo'));
    expect(tokyo.map((entry) => entry.destination.name)).toEqual(['Tokyo', 'Tokyo', 'Tokyo']);
  });

  // @covers REQ-TRV-065@v1
  test('lists only the feedback inside a date range, and none outside it', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    expect(listOf(await asAdmin('GET', '/api/admin/feedback?from=2026-09-23&to=2026-09-23'))).toHaveLength(5);
    expect(listOf(await asAdmin('GET', '/api/admin/feedback?from=2026-09-24&to=2026-10-15'))).toEqual([]);
    expect(listOf(await asAdmin('GET', '/api/admin/feedback?from=2026-09-01&to=2026-09-22'))).toEqual([]);
  });

  // @covers REQ-TRV-065@v1
  test('lists rated 2, 3, 4, 4, 5 when sorted by rating, lowest first', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    const list = listOf(await asAdmin('GET', '/api/admin/feedback?sort=rating&order=asc'));

    expect(list.map((entry) => entry.rating)).toEqual([2, 3, 4, 4, 5]);
  });

  // @covers REQ-TRV-065@v1
  test('treats a blank filter as one not sent', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    expect(listOf(await asAdmin('GET', '/api/admin/feedback?keyword=&rating=&destination=&from=&to=&sort=&order='))).toHaveLength(5);
  });

  // @covers REQ-TRV-065@v1
  test.each([
    ['rating=9', 'rating'],
    ['rating=two', 'rating'],
    ['sort=comment', 'sort'],
    ['order=sideways', 'order'],
    ['from=yesterday', 'from'],
    ['to=2026-13-40', 'to'],
    ['from=2026-10-15&to=2026-09-15', 'to'],
    ['tag=busy', 'tag'],
  ])('answers 400 naming the field for ?%s', async (query, field) => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    const refused = await asAdmin('GET', `/api/admin/feedback?${query}`);

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'VALIDATION_FAILED', field });
  });

  // @covers REQ-TRV-065@v1
  test('exports exactly the entries a filter leaves as CSV, with rating, comment, Destination and date and nothing else', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    const csv = await asAdmin('GET', '/api/admin/feedback/export?keyword=busy&sort=rating&order=asc');

    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="feedback\.csv"/);
    expect(csv.body.trimEnd().split('\r\n')).toEqual([
      'Rating,Comment,Destination,Date',
      '2,Far too busy everywhere,Tokyo,2026-09-23',
      '3,Day 2 too busy,Tokyo,2026-09-23',
      '4,Busy but lovely,Paris,2026-09-23',
    ]);
  });

  // @covers REQ-TRV-065@v1
  test('neutralises a comment a spreadsheet would run as a formula', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('formula@example.com');
    await scenario.feedbackFrom(traveler, { rating: 3, comment: '=HYPERLINK("http://evil.example","click")' });

    const csv = await scenario.asAdmin('GET', '/api/admin/feedback/export');

    expect(csv.body).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
  });

  // @covers REQ-TRV-065@v1
  test('gives the browser a CSV it will not run as anything else', async () => {
    const { asAdmin } = await aScenarioWithFiveEntries();

    const csv = await asAdmin('GET', '/api/admin/feedback/export');

    expect(csv.headers['x-content-type-options']).toBe('nosniff');
  });

  // @covers REQ-TRV-065@v1
  test('offers no way to tag feedback with a theme: there is no such route', async () => {
    const { testApp, asAdmin } = await aScenarioWithFiveEntries();
    const [entry] = listOf(await asAdmin('GET', '/api/admin/feedback'));

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await asAdmin(method, `/api/admin/feedback/${entry?.id}/tags`);
      expect(response.statusCode).toBe(404);
    }
    // The one route with "theme" in it asks the AI to find themes (REQ-TRV-067); nothing puts a theme on an entry.
    const analysisRoute = '/api/admin/feedback/themes';
    expect(testApp.app.adminRoutes.some((route) => /tag|label|theme/i.test(route.url) && route.url !== analysisRoute)).toBe(false);
  });
});

describe('feedback on a Trip that is permanently deleted, through the API', () => {
  // @covers REQ-TRV-100@v1
  test('stays with rating 4, "Day 2 too busy", Destination Tokyo and its date, with no Trip and no Traveler', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('leaving@example.com', { destination: 'Tokyo' });
    await scenario.feedbackFrom(traveler, { rating: 4, comment: 'Day 2 too busy' });
    await scenario.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${traveler.tripId}`, cookies: traveler.cookies });
    scenario.testApp.clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);

    createTripService({ db: scenario.testApp.db, clock: scenario.testApp.clock }).purgeExpired();
    await scenario.adminLoginAgain();

    const response = await scenario.asAdmin('GET', '/api/admin/feedback');
    expect(listOf(response)).toMatchObject([{ rating: 4, comment: 'Day 2 too busy', destination: { name: 'Tokyo' }, tripName: null, date: '2026-09-23' }]);
    expect(response.body).not.toContain(traveler.tripId);
    expect(response.body).not.toContain('leaving@example.com');
  });

  // @covers REQ-TRV-063@v1
  test('is read by the Administrator with no Traveler or Trip identified, and the Traveler cannot reach it either', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('gone@example.com');
    await scenario.feedbackFrom(traveler, { rating: 5, comment: 'Great' });
    await scenario.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${traveler.tripId}`, cookies: traveler.cookies });
    scenario.testApp.clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);
    createTripService({ db: scenario.testApp.db, clock: scenario.testApp.clock }).purgeExpired();

    await scenario.adminLoginAgain();
    const cookies = await scenario.loginAgain('gone@example.com');

    const theirs = await scenario.testApp.app.inject({ method: 'GET', url: `/api/trips/${traveler.tripId}/feedback`, cookies });

    expect(theirs.statusCode).toBe(404);
    expect(listOf(await scenario.asAdmin('GET', '/api/admin/feedback'))).toHaveLength(1);
  });
});

describe('what a browser may keep of the Administrator\'s pages', () => {
  // @covers REQ-TRV-064@v1
  test.each(['/api/admin/feedback', '/api/admin/feedback/export', '/api/admin/trips', '/api/admin/metrics'])(
    'is nothing of %s: it is sent no-store, since it holds other people\'s details',
    async (url) => {
      const { asAdmin } = await aScenarioWithFiveEntries();

      const response = await asAdmin('GET', url);

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toMatch(/no-store/);
    },
  );

  // @covers REQ-TRV-062@v1
  test('is nothing of a Traveler\'s own feedback either', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('mine@example.com');
    await scenario.feedbackFrom(traveler, { rating: 4, comment: 'Lovely' });

    const mine = await scenario.testApp.app.inject({ method: 'GET', url: `/api/trips/${traveler.tripId}/feedback`, cookies: traveler.cookies });

    expect(mine.headers['cache-control']).toMatch(/no-store/);
  });
});
