import { expect, test } from '@playwright/test';
import { generatePlan, aTripReadyToPlan, setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('waiting for a Plan to be generated', () => {
  // @covers REQ-TRV-080@v1
  test('shows how long it has been going and a progress indicator, and the seconds go up while the page stays put', async ({ browser }) => {
    const { page, tripName } = await aTripReadyToPlan(browser, 'plan-progress');
    await setAiScript({ mode: 'hang' });

    await generatePlan(page);

    const status = page.getByRole('status');
    await expect(status).toContainText(/Generating your Plan… \d+ seconds? so far\. This can take up to two minutes\./);
    await expect(page.getByRole('progressbar', { name: 'Progress of the AI request' })).toBeVisible();
    await expect(status).toContainText('1 second so far');
    await expect(page.getByRole('heading', { name: tripName })).toBeVisible();
  });

  // @covers REQ-TRV-080@v1
  test('goes away, with the progress indicator, when the AI gives up, and the Plan can be asked for again', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'plan-progress-over');
    await setAiScript({ mode: 'hang' });

    await generatePlan(page);
    await expect(page.getByRole('progressbar')).toBeVisible();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generate Plan' })).toBeEnabled();
  });
});
