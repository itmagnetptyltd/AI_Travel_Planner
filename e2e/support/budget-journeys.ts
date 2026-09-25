import { expect, type Locator, type Page } from '@playwright/test';

/** What the scripted AI's 4-Day Plan is estimated to cost: 3 nights at 150, 4 lunches at 15 and 4 mornings at 10. */
export const SCRIPTED_ESTIMATES = ['450', '60', '0', '40', '0', '0'] as const;
export const SCRIPTED_TOTAL = 550;

export const budgetSection = (page: Page): Locator => page.getByRole('region', { name: 'Estimated costs' });

/** The figure shown against a heading of the budget section, such as `Estimated total`. */
export const figureOf = (page: Page, heading: string): Locator =>
  budgetSection(page).locator('dt', { hasText: heading }).locator('xpath=following-sibling::dd');

export async function expectEstimatedTotal(page: Page, total: number): Promise<void> {
  await expect(figureOf(page, 'Estimated total')).toHaveText(`${total} USD (an estimate, not a price)`);
}
