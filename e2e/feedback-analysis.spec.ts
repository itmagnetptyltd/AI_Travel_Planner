import { expect, test, type Browser, type Page } from '@playwright/test';
import { AI_UNAVAILABLE_MESSAGE } from '../src/shared/plan-schemas';
import { logInAsAdministrator } from './support/admin-journeys';
import { giveFeedbackThroughUi, uniqueWord } from './support/feedback-journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, trackForeignRequests, TRIP_DAY_COUNT } from './support/plan-journeys';

const SUMMARY = 'Travelers mostly found the schedules too busy.';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

/**
 * Three Travelers, each with a Trip and a comment carrying a word only this test uses: two say the days were busy, one praises the
 * food. With `andOneOutsider`, a fourth comments without that word, so an analysis that ignored the filter would count four.
 */
async function threeTravelersWhoGaveFeedback(browser: Browser, { andOneOutsider = false } = {}): Promise<string> {
  const word = uniqueWord();
  const given = [
    { rating: 2, comment: `${word}alpha too busy` },
    { rating: 1, comment: `${word}beta busy every day` },
    { rating: 5, comment: `${word}gamma wonderful food` },
  ];
  for (const [index, entry] of given.entries()) {
    const ready = await aTripWithAPlan(browser, `analysis-${index}`);
    await giveFeedbackThroughUi(ready.page, entry.rating, entry.comment);
  }
  if (andOneOutsider) {
    const outsider = await aTripWithAPlan(browser, 'analysis-outsider');
    await giveFeedbackThroughUi(outsider.page, 3, 'A comment that does not carry the word, and is not busy at all');
  }
  return word;
}

/** Shows the feedback carrying `word`, so the analysis is of those three comments and nothing else in the shared database. */
async function showFeedbackWith(page: Page, word: string): Promise<void> {
  await page.goto('/admin/feedback');
  await page.getByLabel('Keyword in the comment', { exact: true }).fill(word);
  await page.getByRole('button', { name: 'Show feedback' }).click();
  await expect(page.getByRole('row').filter({ hasText: `${word}gamma` })).toBeVisible();
}

const analysisOf = (page: Page) => page.getByRole('region', { name: 'AI analysis' });

test.describe('the Administrator asking the AI to summarise feedback', () => {
  // @covers REQ-TRV-066@v1
  test('shows the summary the AI wrote, and what it is based on', async ({ page, browser }) => {
    const word = await threeTravelersWhoGaveFeedback(browser, { andOneOutsider: true });
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, feedback: { summary: SUMMARY } });
    await logInAsAdministrator(page);
    await showFeedbackWith(page, word);

    await page.getByRole('button', { name: 'Summarise feedback' }).click();

    await expect(analysisOf(page).getByText(SUMMARY)).toBeVisible();
    await expect(analysisOf(page).getByText('Based on 3 comments.')).toBeVisible();
    await expect(analysisOf(page).getByText(/written by the AI/i)).toBeVisible();
  });

  // @covers REQ-TRV-066@v1
  test('never has the browser reach the AI provider: every request it sends goes to the application', async ({ page, browser }) => {
    const word = await threeTravelersWhoGaveFeedback(browser);
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, feedback: { summary: SUMMARY } });
    await logInAsAdministrator(page);
    const ownOrigin = new URL(page.url()).origin;
    const foreign = trackForeignRequests(page, ownOrigin);
    const sent: string[] = [];
    page.on('request', (request) => sent.push(`${request.method()} ${new URL(request.url()).pathname}`));
    await showFeedbackWith(page, word);

    await page.getByRole('button', { name: 'Summarise feedback' }).click();
    await expect(analysisOf(page).getByText(SUMMARY)).toBeVisible();

    expect(foreign()).toEqual([]);
    expect(sent).toContain('POST /api/admin/feedback/summary');
  });

  // @covers REQ-TRV-066@v1
  test('says the AI is unavailable when it fails, and leaves the feedback list readable', async ({ page, browser }) => {
    const word = await threeTravelersWhoGaveFeedback(browser);
    await setAiScript({ mode: 'error' });
    await logInAsAdministrator(page);
    await showFeedbackWith(page, word);

    await page.getByRole('button', { name: 'Summarise feedback' }).click();

    await expect(page.getByRole('alert')).toHaveText(AI_UNAVAILABLE_MESSAGE);
    await expect(page.getByRole('row').filter({ hasText: `${word}alpha` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Summarise feedback' })).toBeEnabled();
  });

  // @covers REQ-TRV-066@v1
  test('says there is nothing to analyse when no comment is shown', async ({ page }) => {
    await logInAsAdministrator(page);
    await page.goto('/admin/feedback');
    await page.getByLabel('Keyword in the comment', { exact: true }).fill(`${uniqueWord()}nothing`);
    await page.getByRole('button', { name: 'Show feedback' }).click();
    await expect(page.getByText('No feedback matches.')).toBeVisible();

    await page.getByRole('button', { name: 'Summarise feedback' }).click();

    await expect(page.getByText('There are no comments to analyse.')).toBeVisible();
  });
});

test.describe('the Administrator asking the AI for recurring themes', () => {
  // @covers REQ-TRV-067@v1
  test('shows the theme "schedules are too busy" with the two entries counted against it', async ({ page, browser }) => {
    const word = await threeTravelersWhoGaveFeedback(browser, { andOneOutsider: true });
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, feedback: { themes: [{ name: 'schedules are too busy', matching: 'busy' }] } });
    await logInAsAdministrator(page);
    await showFeedbackWith(page, word);

    await page.getByRole('button', { name: 'Find recurring themes' }).click();

    await expect(analysisOf(page).getByRole('listitem').filter({ hasText: 'schedules are too busy' })).toHaveText('schedules are too busy: 2 entries');
    await expect(analysisOf(page).getByText('Based on 3 comments.')).toBeVisible();
  });

  // @covers REQ-TRV-067@v1
  test('replaces a summary already shown, rather than adding to it', async ({ page, browser }) => {
    const word = await threeTravelersWhoGaveFeedback(browser);
    await setAiScript({
      mode: 'ok',
      dayCount: TRIP_DAY_COUNT,
      feedback: { summary: SUMMARY, themes: [{ name: 'schedules are too busy', matching: 'busy' }] },
    });
    await logInAsAdministrator(page);
    await showFeedbackWith(page, word);
    await page.getByRole('button', { name: 'Summarise feedback' }).click();
    await expect(analysisOf(page).getByText(SUMMARY)).toBeVisible();

    await page.getByRole('button', { name: 'Find recurring themes' }).click();

    await expect(analysisOf(page).getByText('schedules are too busy: 2 entries')).toBeVisible();
    await expect(analysisOf(page).getByText(SUMMARY)).toHaveCount(0);
  });
});
