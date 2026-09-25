import { expect, test } from '@playwright/test';
import { aTravelerInNewContext, logInAsAdministrator } from './support/admin-journeys';
import { feedbackSection, giveFeedbackThroughUi, seedDeletedTripWithFeedback, uniqueWord } from './support/feedback-journeys';
import { logInThroughUi } from './support/journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { aTripReadyToPlan, setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';
import { aDestinationAddedByAdministrator } from './support/trip-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('rating a Trip\'s Plan', () => {
  // @covers REQ-TRV-062@v1
  test('a Traveler rates the Plan 4 with a comment and is thanked, and after reloading finds it, and can change it to 5', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'feedback-rate');

    await giveFeedbackThroughUi(page, 4, 'Day 2 too busy');
    await page.reload();

    await expect(feedbackSection(page).getByRole('radio', { name: '4 stars' })).toBeChecked();
    await expect(feedbackSection(page).getByLabel('Comment (optional)')).toHaveValue('Day 2 too busy');
    await giveFeedbackThroughUi(page, 5, 'Much better on Day 2');
    await page.reload();
    await expect(feedbackSection(page).getByRole('radio', { name: '5 stars' })).toBeChecked();
    await expect(feedbackSection(page).getByRole('radio', { name: '4 stars' })).not.toBeChecked();
  });

  // @covers REQ-TRV-062@v1
  test('is accepted with no comment', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'feedback-nocomment');

    await feedbackSection(page).getByRole('radio', { name: '3 stars' }).check();
    await feedbackSection(page).getByRole('button', { name: 'Save feedback' }).click();

    await expect(feedbackSection(page).getByText('Thank you. Your feedback was saved.')).toBeVisible();
  });

  // @covers REQ-TRV-062@v1
  test('is refused with no rating, in words, and saves nothing', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'feedback-norating');

    await feedbackSection(page).getByLabel('Comment (optional)').fill('Day 2 too busy');
    await feedbackSection(page).getByRole('button', { name: 'Save feedback' }).click();

    await expect(page.getByRole('alert')).toHaveText('Choose a rating from 1 to 5.');
    await page.reload();
    await expect(feedbackSection(page).getByLabel('Comment (optional)')).toHaveValue('');
  });

  // @covers REQ-TRV-062@v1
  test('is not offered for a Trip that has no Plan', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'feedback-noplan');

    await expect(page.getByRole('button', { name: 'Generate Plan' })).toBeVisible();

    await expect(feedbackSection(page)).toHaveCount(0);
  });
});

test.describe('feedback on a Trip that is permanently deleted', () => {
  // @covers REQ-TRV-100@v1
  test('stays with its rating, comment, Destination and date, with no Trip and no Traveler, once the Trip is removed for good', async ({ page, browser }) => {
    const { name: destinationName } = await aDestinationAddedByAdministrator(browser, 'Purge Tokyo');
    const traveler = await aTravelerInNewContext(browser, 'feedback-purge', { confirmed: true });
    await logInThroughUi(traveler.page, traveler.email);
    const comment = `${uniqueWord()} Day 2 too busy`;
    const date = seedDeletedTripWithFeedback({ ownerEmail: traveler.email, destinationName, destinationCountry: 'Japan', rating: 4, comment });
    await logInAsAdministrator(page);

    await expect(async () => {
      await page.goto('/admin/feedback');
      await page.getByLabel('Keyword in the comment').fill(comment);
      await page.getByRole('button', { name: 'Show feedback' }).click();
      const row = page.getByRole('row', { name: new RegExp(comment) });
      await expect(row).toContainText('No longer available');
    }).toPass({ timeout: 15_000 });

    const row = page.getByRole('row', { name: new RegExp(comment) });
    await expect(row).toContainText('4');
    await expect(row).toContainText(comment);
    await expect(row).toContainText(destinationName);
    await expect(row).toContainText(date);
    await expect(row).not.toContainText(traveler.email);
    await expect(row).not.toContainText('A Trip that is being deleted');
  });
});
