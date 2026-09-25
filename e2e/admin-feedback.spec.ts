import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { logInAsAdministrator } from './support/admin-journeys';
import { giveFeedbackThroughUi, uniqueWord } from './support/feedback-journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

/** Three Travelers, each with a Trip, a Plan and one piece of feedback, all carrying a word only this test uses. */
async function threeTravelersWhoGaveFeedback(browser: Parameters<typeof aTripWithAPlan>[0]) {
  const word = uniqueWord();
  const given = [
    { rating: 2, comment: `${word}alpha too busy` },
    { rating: 4, comment: `${word}beta busy again` },
    { rating: 5, comment: `${word}gamma wonderful` },
  ];
  const trips: { tripName: string; destinationName: string; rating: number; comment: string }[] = [];
  for (const [index, entry] of given.entries()) {
    const ready = await aTripWithAPlan(browser, `admin-feedback-${index}`);
    await giveFeedbackThroughUi(ready.page, entry.rating, entry.comment);
    trips.push({ tripName: ready.tripName, destinationName: ready.destinationName, ...entry });
  }
  return { word, trips };
}

async function filterBy(page: Page, fields: Record<string, string>, sort?: string): Promise<void> {
  await page.goto('/admin/feedback');
  for (const [label, value] of Object.entries(fields)) {
    if (label === 'Rating') await page.getByLabel('Rating', { exact: true }).selectOption(value);
    else await page.getByLabel(label, { exact: true }).fill(value);
  }
  if (sort) await page.getByLabel('Sort').selectOption({ label: sort });
  await page.getByRole('button', { name: 'Show feedback' }).click();
}

const ratingsShown = (page: Page) => page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') }).locator('td:first-child');

test.describe('the Administrator reviewing feedback', () => {
  // @covers REQ-TRV-064@v1
  test('lists the Travelers\' feedback, each with its rating, comment and Trip', async ({ page, browser }) => {
    const { word, trips } = await threeTravelersWhoGaveFeedback(browser);
    await logInAsAdministrator(page);

    await filterBy(page, { 'Keyword in the comment': word });

    for (const trip of trips) {
      const row = page.getByRole('row', { name: new RegExp(trip.comment) });
      await expect(row).toContainText(String(trip.rating));
      await expect(row).toContainText(trip.tripName);
    }
    await expect(ratingsShown(page)).toHaveCount(3);
  });

  // @covers REQ-TRV-065@v1
  test('narrows the list by keyword, by rating, and by Destination', async ({ page, browser }) => {
    const { word, trips } = await threeTravelersWhoGaveFeedback(browser);
    await logInAsAdministrator(page);

    await filterBy(page, { 'Keyword in the comment': `${word}beta` });
    await expect(ratingsShown(page)).toHaveText(['4']);

    await filterBy(page, { 'Keyword in the comment': word, Rating: '2' });
    await expect(ratingsShown(page)).toHaveText(['2']);

    await filterBy(page, { Destination: trips[2]?.destinationName ?? '' });
    await expect(ratingsShown(page)).toHaveText(['5']);
  });

  // @covers REQ-TRV-065@v1
  test('narrows the list to a date range, and finds none outside it', async ({ page, browser }) => {
    const { word } = await threeTravelersWhoGaveFeedback(browser);
    await logInAsAdministrator(page);

    await filterBy(page, { 'Keyword in the comment': word, From: '2001-01-01', To: '2001-12-31' });
    await expect(page.getByRole('status')).toHaveText('No feedback matches.');

    await filterBy(page, { 'Keyword in the comment': word, From: '2001-01-01', To: '2100-12-31' });
    await expect(ratingsShown(page)).toHaveCount(3);
  });

  // @covers REQ-TRV-065@v1
  test('sorts by rating, lowest first', async ({ page, browser }) => {
    const { word } = await threeTravelersWhoGaveFeedback(browser);
    await logInAsAdministrator(page);

    await filterBy(page, { 'Keyword in the comment': word }, 'Rating, lowest first');

    await expect(ratingsShown(page)).toHaveText(['2', '4', '5']);
  });

  // @covers REQ-TRV-065@v1
  test('exports the list as it is filtered as CSV: exactly those entries, with rating, comment, Destination and date', async ({ page, browser }) => {
    const { word, trips } = await threeTravelersWhoGaveFeedback(browser);
    await logInAsAdministrator(page);
    await filterBy(page, { 'Keyword in the comment': `${word}` }, 'Rating, lowest first');
    await expect(ratingsShown(page)).toHaveCount(3);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
    const csv = await readFile((await download.path()) ?? '', 'utf8');

    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Rating,Comment,Destination,Date');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(new RegExp(`^2,${trips[0]?.comment},`));
    expect(lines[3]).toMatch(new RegExp(`^5,${trips[2]?.comment},`));
    expect(csv).not.toContain(trips[0]?.tripName ?? 'never');
  });

  // @covers REQ-TRV-065@v1
  test('offers no way to tag feedback with a theme', async ({ page }) => {
    await logInAsAdministrator(page);

    await page.goto('/admin/feedback');

    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
    // "Find recurring themes" asks the AI (REQ-TRV-067); nothing here tags an entry with a theme.
    await expect(page.getByRole('button', { name: /tag|label/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /tag|label/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /theme/i })).toHaveCount(1);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });
});
