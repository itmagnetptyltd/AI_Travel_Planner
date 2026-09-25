import { expect, test } from '@playwright/test';
import { E2E_AI_API_KEY } from '../playwright.config';
import { generatePlan, aTripReadyToPlan, expectDaysShown, setAiScript, trackForeignRequests, TRIP_DAY_COUNT } from './support/plan-journeys';
import { daysFromToday } from './support/trip-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('generating a Plan', () => {
  // @covers REQ-TRV-026@v1
  test('a Traveler generates a Plan and sees one Day for every date of the Trip, each holding Activities in time order', async ({
    browser,
  }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-days');

    await generatePlan(page);

    await expectDaysShown(page);
    const firstDay = page.getByRole('region', { name: `Day 1, ${daysFromToday(7)}` });
    await expect(firstDay.getByRole('button')).toHaveText([
      '09:00 Morning temple visit',
      '12:30 Lunch at a local noodle bar',
      '18:00 Evening stroll through the old town',
    ]);
  });

  test('shows that generation is under way, and stops the button being pressed again, until the AI answers', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-busy');
    await setAiScript({ mode: 'hang' });

    await generatePlan(page);

    await expect(page.getByRole('status')).toContainText('Generating your Plan');
    await expect(page.getByRole('button', { name: 'Generate Plan' })).toBeDisabled();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate Plan' })).toBeEnabled();
  });

  // @covers REQ-TRV-026@v1
  test('the AI key appears in no page or script the application serves', async ({ request }) => {
    const index = await request.get('/');
    const html = await index.text();
    const assetPaths = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []));
    expect(assetPaths.some((path) => path.endsWith('.js'))).toBe(true);

    const served = [html, ...(await Promise.all(assetPaths.map(async (path) => (await request.get(path)).text())))];

    for (const body of served) {
      expect(body).not.toContain(E2E_AI_API_KEY);
      expect(body).not.toContain('api.anthropic.com');
    }
  });

  // @covers REQ-TRV-026@v1
  test('the browser sends no request to the AI provider, or to anywhere but the application, while generating', async ({
    browser,
    baseURL,
  }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-network');
    const foreignRequests = trackForeignRequests(page, new URL(baseURL ?? 'http://127.0.0.1:5174').origin);

    await generatePlan(page);
    await expectDaysShown(page);

    expect(foreignRequests()).toEqual([]);
  });

  // @covers REQ-TRV-031@v1
  test('a generated Plan is shown with the notice that it is a recommendation, not a booking', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-notice');

    await generatePlan(page);

    await expect(
      page.getByText('recommendations, not guaranteed availability, prices or bookings'),
    ).toBeVisible();
  });

  // @covers REQ-TRV-044@v1
  test('a Traveler opens an Activity and sees its time, duration, estimated cost, location and why it was recommended', async ({
    browser,
  }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-activity');
    await generatePlan(page);
    const firstDay = page.getByRole('region', { name: `Day 1, ${daysFromToday(7)}` });

    await firstDay.getByRole('button', { name: '09:00 Morning temple visit' }).click();

    const details = firstDay.getByRole('term').filter({ hasText: /./ });
    await expect(details).toHaveText(['Time', 'Duration', 'Estimated cost', 'Location', 'Why it was recommended']);
    await expect(firstDay.getByText('1 h 30 min')).toBeVisible();
    await expect(firstDay.getByText('10 USD (an estimate, not a price)')).toBeVisible();
    await expect(firstDay.getByText('City centre')).toBeVisible();
    await expect(firstDay.getByText('A well-loved way to spend part of day 1.')).toBeVisible();
  });
});

test.describe('when the AI fails', () => {
  // @covers REQ-TRV-029@v2
  test('shows the fallback message, leaves the Trip as it was, and offers no way to build a Plan by hand', async ({ browser }) => {
    const { page, tripName } = await aTripReadyToPlan(browser, 'plan-fallback');
    await setAiScript({ mode: 'error' });

    await generatePlan(page);

    await expect(page.getByRole('alert')).toContainText('The AI planner is unavailable right now');
    await expect(page.getByRole('heading', { name: tripName })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /add|build|create|write/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /add|build|create|write/i })).toHaveCount(0);
  });

  // @covers REQ-TRV-029@v2
  test('shows the fallback message when the AI does not answer in time', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-timeout');
    await setAiScript({ mode: 'hang' });

    await generatePlan(page);

    await expect(page.getByRole('alert')).toContainText('The AI planner is unavailable right now', { timeout: 10_000 });
  });

  // @covers REQ-TRV-029@v2
  test('lets the Traveler try again once the AI is back', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-retry');
    await setAiScript({ mode: 'error' });
    await generatePlan(page);
    await expect(page.getByRole('alert')).toBeVisible();

    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
    await generatePlan(page);

    await expectDaysShown(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // @covers REQ-TRV-030@v2
  test('the Trip list and a saved Trip still load, with their data, while the AI does not respond', async ({ browser }) => {
    const { page, tripName, destinationName } = await aTripReadyToPlan(browser, 'plan-down');
    await setAiScript({ mode: 'hang' });

    await page.goto('/trips');
    await expect(page.getByRole('row', { name: new RegExp(tripName) })).toContainText(`${destinationName}, Japan`);
    await page.getByRole('link', { name: tripName }).click();

    await expect(page.getByRole('heading', { name: tripName })).toBeVisible();
    await expect(page.getByText(`${daysFromToday(7)} to ${daysFromToday(10)}`)).toBeVisible();
  });
});
