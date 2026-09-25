import { expect, test } from '@playwright/test';
import { setDailyLimit } from './support/ai-limit-journeys';
import { generatePlan, aTripReadyToPlan, expectDaysShown, setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

const LIMIT_LABEL = 'Plan generations per Traveler per day';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('the daily Plan generation limit', () => {
  // @covers REQ-TRV-091@v1
  test('an Administrator sets the limit to 2 and the Traveler\'s third generation is refused with the reset time', async ({
    browser,
  }) => {
    const { page, admin } = await aTripReadyToPlan(browser, 'limit');
    await setDailyLimit(admin, 2);
    try {
      await generatePlan(page);
      await expectDaysShown(page);
      await generatePlan(page);
      await expectDaysShown(page);

      await generatePlan(page);

      await expect(page.getByRole('alert')).toContainText("today's limit of 2 Plan generations");
      await expect(page.getByRole('alert')).toContainText(/resets at \d{4}-\d\d-\d\d 00:00 UTC/);
    } finally {
      await setDailyLimit(admin, 20);
    }
  });

  // @covers REQ-TRV-091@v1
  test('the limit an Administrator saved is shown again when the page is reopened', async ({ browser }) => {
    const { admin } = await aTripReadyToPlan(browser, 'limit-read');
    try {
      await setDailyLimit(admin, 7);

      await admin.goto('/admin/ai-usage-limits');

      await expect(admin.getByLabel(LIMIT_LABEL)).toHaveValue('7');
    } finally {
      await setDailyLimit(admin, 20);
    }
  });

  // @covers REQ-TRV-091@v1
  test('refuses a limit of 0 with a message', async ({ browser }) => {
    const { admin } = await aTripReadyToPlan(browser, 'limit-zero');
    await admin.goto('/admin/ai-usage-limits');
    await admin.getByLabel(LIMIT_LABEL).fill('0');

    await admin.getByRole('button', { name: 'Save limit' }).click();

    await expect(admin.getByRole('alert')).toContainText('dailyPlanGenerationLimit is not valid.');
  });
});

test.describe('stored AI requests', () => {
  // @covers REQ-TRV-034@v1
  test('an Administrator reaches a stored request from the AI usage limits page and sees the text sent and returned', async ({
    browser,
  }) => {
    const { page, admin, destinationName } = await aTripReadyToPlan(browser, 'stored');
    await generatePlan(page);
    await expectDaysShown(page);

    await admin.goto('/admin/ai-usage-limits');
    await admin.getByRole('link', { name: 'Stored AI requests' }).click();
    await admin.getByRole('row').nth(1).getByRole('link', { name: 'View' }).click();

    await expect(admin.getByRole('heading', { name: 'AI request' })).toBeVisible();
    await expect(admin.getByRole('heading', { name: 'Sent to the AI' })).toBeVisible();
    await expect(admin.locator('pre').first()).toContainText(destinationName);
    await expect(admin.locator('pre').last()).toContainText('"dayNumber"');
  });

  // @covers REQ-TRV-068@v2
  test('the admin dashboard still lists exactly five functions, with AI usage limits now a link', async ({ browser }) => {
    const { admin } = await aTripReadyToPlan(browser, 'dashboard');

    await admin.goto('/admin');

    await expect(admin.getByRole('navigation', { name: 'Admin functions' }).getByRole('listitem')).toHaveCount(5);
    await expect(admin.getByRole('link', { name: 'AI usage limits' })).toBeVisible();
  });
});
