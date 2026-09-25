import { expect, type Page } from '@playwright/test';

const LIMIT_LABEL = 'Plan generations per Traveler per day';

/** An Administrator sets how many Plan generations each Traveler may make in a day. */
export async function setDailyLimit(admin: Page, limit: number): Promise<void> {
  await admin.goto('/admin/ai-usage-limits');
  await admin.getByLabel(LIMIT_LABEL).fill(String(limit));
  await admin.getByRole('button', { name: 'Save limit' }).click();
  await expect(admin.getByRole('status')).toHaveText('Limit saved.');
}
