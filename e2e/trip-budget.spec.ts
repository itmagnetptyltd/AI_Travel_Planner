import { expect, test } from '@playwright/test';
import { budgetSection, expectEstimatedTotal, figureOf, SCRIPTED_ESTIMATES, SCRIPTED_TOTAL } from './support/budget-journeys';
import { SCRIPTED, sendChat, suggestedChange, theAiWillReply } from './support/chat-journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

const CATEGORIES = ['Accommodation', 'Food', 'Transportation', 'Activities', 'Shopping', 'Other'];
const estimateText = (amount: string) => `${amount} USD (an estimate, not a price)`;

test.describe('the estimated costs of a Plan', () => {
  // @covers REQ-TRV-049@v1
  test('are shown for six categories, each labelled an estimate, and are still there after reloading the page', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'budget-six');

    await expect(budgetSection(page).getByRole('term')).toHaveText([...CATEGORIES, 'Estimated total', 'Budget']);
    await expect(budgetSection(page).getByRole('definition')).toHaveText([
      ...SCRIPTED_ESTIMATES.map(estimateText),
      estimateText(String(SCRIPTED_TOTAL)),
      '5000 USD',
    ]);
    await page.reload();

    await expectEstimatedTotal(page, SCRIPTED_TOTAL);
    await expect(figureOf(page, 'Accommodation')).toHaveText(estimateText('450'));
  });

  // @covers REQ-TRV-051@v1
  test('say how far under budget they are, that the budget is for the whole group at the Destination only, and the per-person figure', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'budget-under', 4, { adults: '2', children: '2' });

    await expect(budgetSection(page)).toContainText('4450 USD under budget');
    await expect(budgetSection(page)).toContainText('one total for the whole group');
    await expect(budgetSection(page)).toContainText('at the Destination only');
    await expect(budgetSection(page)).toContainText('does not include travel to and from the Destination');
    await expect(budgetSection(page)).toContainText('1250 USD per person, for information only');
  });

  // @covers REQ-TRV-051@v1
  test('say how far over budget they are when the total is above it', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'budget-over', 4, { budget: '300' });

    await expect(figureOf(page, 'Budget')).toHaveText('300 USD');
    await expect(budgetSection(page)).toContainText('250 USD over budget');
  });
});

test.describe('asking the chat to reduce the cost', () => {
  const withoutLunchOnDayThree = [{ dayNumber: 3, activities: [SCRIPTED.morning, SCRIPTED.evening] }];

  // @covers REQ-TRV-053@v1
  test('shows the new total beside the previous one, leaves the saved total alone until Accept, and changes it on Accept', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'budget-chat');
    await theAiWillReply('I removed lunch on Day 3.', withoutLunchOnDayThree);

    await sendChat(page, 'Reduce the cost');

    await expect(suggestedChange(page)).toContainText('Estimated total 535 USD (was 550 USD)');
    await expectEstimatedTotal(page, SCRIPTED_TOTAL);
    await suggestedChange(page).getByRole('button', { name: 'Accept' }).click();

    await expectEstimatedTotal(page, SCRIPTED_TOTAL - 15);
  });
});
