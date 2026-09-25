import { expect, test, type Page } from '@playwright/test';
import { aTravelerInNewContext, logInAsAdministrator } from './support/admin-journeys';
import { giveFeedbackThroughUi } from './support/feedback-journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

/** The figure shown against a heading of the dashboard, such as `Total users`. */
const figureOf = (page: Page, heading: string) => page.locator('dt', { hasText: heading }).locator('xpath=following-sibling::dd[1]');

const numberOf = async (page: Page, heading: string): Promise<number> => Number.parseInt((await figureOf(page, heading).textContent()) ?? 'NaN', 10);

/** Chooses the AI usage dates and waits for the figures for exactly that range, so what is read next is not the last range's. */
async function chooseRange(page: Page, from: string, to: string): Promise<void> {
  const answered = page.waitForResponse((response) => response.url().includes('/api/admin/metrics') && response.url().includes(`from=${from}`) && response.url().includes(`to=${to}`));
  await page.getByLabel('From').fill(from);
  await page.getByLabel('To').fill(to);
  await answered;
  await expect(page.locator('dl[aria-busy="false"]')).toBeVisible();
}

const dayFromNow = (days: number): string => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface Figures {
  users: number;
  trips: number;
  planned: number;
  generated: number;
  feedback: number;
}

async function readFigures(page: Page): Promise<Figures> {
  await page.goto('/admin');
  await expect(figureOf(page, 'Total users')).toBeVisible();
  const split = (await figureOf(page, 'Total trips').textContent()) ?? '';
  const planned = Number(/(\d+) Planned/.exec(split)?.[1] ?? Number.NaN);
  return {
    users: await numberOf(page, 'Total users'),
    trips: await numberOf(page, 'Total trips'),
    planned,
    generated: await numberOf(page, 'Generated itineraries'),
    feedback: await numberOf(page, 'Feedback volume'),
  };
}

test.describe('the usage metrics on the admin dashboard', () => {
  // @covers REQ-TRV-069@v1
  test('move by exactly what a new Traveler, Trip, Plan and piece of feedback add', async ({ page, browser }) => {
    await logInAsAdministrator(page);
    const before = await readFigures(page);

    const ready = await aTripWithAPlan(browser, 'dashboard-figures');
    await giveFeedbackThroughUi(ready.page, 4, 'Lovely');
    const after = await readFigures(page);

    expect(after.users).toBe(before.users + 1);
    expect(after.trips).toBe(before.trips + 1);
    expect(after.planned).toBe(before.planned + 1);
    expect(after.generated).toBe(before.generated + 1);
    expect(after.feedback).toBe(before.feedback + 1);
  });

  // @covers REQ-TRV-069@v1
  test('show the split of Trips, the average rating with one decimal, popular Destinations and the average budget of each currency', async ({ page, browser }) => {
    const ready = await aTripWithAPlan(browser, 'dashboard-shape');
    await giveFeedbackThroughUi(ready.page, 4, 'Lovely');
    await logInAsAdministrator(page);

    await page.goto('/admin');

    await expect(figureOf(page, 'Total trips')).toHaveText(/^\d+ \(\d+ Draft, \d+ Planned\)$/);
    await expect(figureOf(page, 'Average rating')).toHaveText(/^\d\.\d$/);
    await expect(page.getByRole('list', { name: 'Ranked by number of Trips' }).getByRole('listitem').first()).toContainText(/: \d+ Trips?$/);
    await expect(page.getByRole('list', { name: 'One figure for each currency' }).getByRole('listitem').filter({ hasText: /^\d+ USD$/ })).toHaveCount(1);
  });

  // @covers REQ-TRV-069@v1
  test('show AI usage for the dates chosen: none in a range long ago, and one more request after a Plan is generated now', async ({ page, browser }) => {
    await logInAsAdministrator(page);
    await page.goto('/admin');
    await chooseRange(page, dayFromNow(-1), dayFromNow(1));
    const before = await numberOf(page, 'AI requests');

    await aTripWithAPlan(browser, 'dashboard-usage');
    await page.goto('/admin');
    await chooseRange(page, dayFromNow(-1), dayFromNow(1));
    expect(await numberOf(page, 'AI requests')).toBe(before + 1);

    await chooseRange(page, '2001-01-01', '2001-01-31');
    await expect(figureOf(page, 'AI requests')).toHaveText('0');
    await expect(figureOf(page, 'Estimated cost')).toHaveText('0.00 USD');
  });

  // @covers REQ-TRV-069@v1
  test('say that a range that runs backwards cannot be shown, and keep the figures that were on show', async ({ page }) => {
    await logInAsAdministrator(page);
    await page.goto('/admin');
    await expect(figureOf(page, 'Total users')).toBeVisible();

    await page.getByLabel('From').fill('2026-10-31');
    await page.getByLabel('To').fill('2026-10-01');

    await expect(page.getByText('The end of the range is before its start.')).toBeVisible();
    await expect(figureOf(page, 'Total users')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('the Administrator seeing Travelers\' Trips', () => {
  // @covers REQ-TRV-070@v1
  // @covers REQ-TRV-101@v1
  test('lists a Trip with its owner and shows its summary and no Days, and refuses its full Plan while it has no feedback', async ({ page, browser }) => {
    const ready = await aTripWithAPlan(browser, 'dashboard-trips');
    await logInAsAdministrator(page);

    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'All Travelers’ Trips' }).click();
    const row = page.getByRole('row', { name: new RegExp(ready.tripName) });
    await expect(row).toContainText(ready.email);
    await expect(row).toContainText('Planned');
    await expect(row).toContainText('No feedback');
    await row.getByRole('link', { name: ready.tripName }).click();

    await expect(page.getByRole('heading', { name: ready.tripName })).toBeVisible();
    await expect(figureOf(page, 'Travelers')).toHaveText('2');
    await expect(figureOf(page, 'Budget')).toHaveText('5000 USD');
    await expect(page.getByText('The full Plan can be opened only when the Trip has feedback.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open full Plan' })).toHaveCount(0);
    await expect(page.getByText(/^Day \d/)).toHaveCount(0);
    await page.goto(`${page.url()}/plan`);
    await expect(page.getByRole('heading', { name: 'The full Plan can be opened only when the Trip has feedback.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Day 1,/ })).toHaveCount(0);
  });

  // @covers REQ-TRV-070@v1
  test('opens the full Plan of a Trip that has feedback, read-only', async ({ page, browser }) => {
    const ready = await aTripWithAPlan(browser, 'dashboard-plan');
    await giveFeedbackThroughUi(ready.page, 2, 'Too busy');
    await logInAsAdministrator(page);

    await page.goto('/admin/trips');
    await page.getByRole('row', { name: new RegExp(ready.tripName) }).getByRole('link', { name: ready.tripName }).click();
    await expect(page.getByText('Rated 2: Too busy')).toBeVisible();
    await page.getByRole('link', { name: 'Open full Plan' }).click();

    await expect(page.getByRole('heading', { name: /^Day 1,/ })).toBeVisible();
    await expect(page.getByText('These Activities, times and costs are recommendations, not guaranteed availability, prices or bookings.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  });
});

test.describe('the roles an account can hold', () => {
  // @covers REQ-TRV-079@v1
  test('are exactly Traveler and Administrator, and a request for Travel Consultant is refused and changes nothing', async ({ page, browser }) => {
    const traveler = await aTravelerInNewContext(browser, 'roles', { confirmed: true });
    await logInAsAdministrator(page);
    await page.goto('/admin/users');
    await expect(page.getByText('Roles an account can hold: Traveler, Administrator.')).toBeVisible();
    await page.getByRole('row', { name: new RegExp(traveler.email) }).getByRole('link', { name: 'View' }).click();
    await expect(page.getByText('Role: Traveler')).toBeVisible();
    const accountPath = new URL(page.url()).pathname.replace('/admin/users/', '');

    const refused = await page.request.put(`/api/admin/accounts/${accountPath}/role`, { data: { role: 'travel-consultant', confirm: true } });

    expect(refused.status()).toBe(400);
    await page.reload();
    await expect(page.getByText('Role: Traveler')).toBeVisible();
  });
});
