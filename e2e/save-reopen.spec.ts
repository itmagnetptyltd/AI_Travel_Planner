import { expect, test, type Page } from '@playwright/test';
import { logInThroughUi } from './support/journeys';
import { aTripReadyToPlan, expectDaysShown, generatePlan, setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';
import { seedPastTripWithPlan } from './support/seed-past-trip';
import { daysFromToday, openTrip } from './support/trip-journeys';
import { uniqueName } from './support/admin-journeys';

const versionList = (page: Page) => page.getByRole('list', { name: 'Plan versions' });
const activityButtons = (page: Page) => page.getByRole('region', { name: /^Day \d/ }).getByRole('button');

async function generateAndWaitForVersion(page: Page, version: number): Promise<void> {
  await generatePlan(page);
  await expect(page.getByText(`Version ${version}`, { exact: true })).toBeVisible();
}

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('saving a generated Plan', () => {
  // @covers REQ-TRV-017@v1
  test('a Traveler generates a Plan, reloads the page and still sees it, and the Trip is listed as Planned', async ({ browser }) => {
    const { page, tripName } = await aTripReadyToPlan(browser, 'save-plan');
    await page.goto('/trips');
    await expect(page.getByRole('row', { name: new RegExp(tripName) })).toContainText('Draft');
    await openTrip(page, tripName);

    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    await generatePlan(page);
    await expectDaysShown(page);
    await expect(page.getByText('Planned', { exact: true })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toHaveCount(0);
    await page.reload();

    await expectDaysShown(page);
    await page.goto('/trips');
    await expect(page.getByRole('row', { name: new RegExp(tripName) })).toContainText('Planned');
  });

  // @covers REQ-TRV-017@v1
  test('the version list holds exactly one version after the first Plan is generated', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'one-version');
    await expect(versionList(page)).toHaveCount(0);

    await generatePlan(page);

    await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
    await expect(versionList(page)).toContainText('Version 1');
  });
});

test.describe('reopening a saved Trip', () => {
  // @covers REQ-TRV-018@v1
  test('shows the same 8 Days and Activities after the Traveler logs out, logs in and opens the Trip', async ({ browser }) => {
    const { page, email, tripName } = await aTripReadyToPlan(browser, 'reopen', 8);
    await generatePlan(page);
    await expectDaysShown(page, 8);
    const before = await activityButtons(page).allInnerTexts();
    expect(before.length).toBeGreaterThan(8);

    await page.getByRole('button', { name: 'Log out' }).click();
    await logInThroughUi(page, email);
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await openTrip(page, tripName);

    await expectDaysShown(page, 8);
    expect(await activityButtons(page).allInnerTexts()).toEqual(before);
  });

  // @covers REQ-TRV-018@v1
  test('restores the first of two versions, shows its Plan, and lists three versions with none removed', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'restore');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'First idea' });
    await generateAndWaitForVersion(page, 1);
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Second idea' });
    await generateAndWaitForVersion(page, 2);
    await expect(activityButtons(page).first()).toContainText('Second idea');

    await page.getByRole('button', { name: 'Restore Version 1' }).click();

    await expect(activityButtons(page).first()).toContainText('First idea');
    await expect(versionList(page).getByRole('listitem')).toHaveCount(3);
    await expect(versionList(page).getByRole('listitem').first()).toContainText('Version 3');
    await expect(versionList(page).getByRole('listitem').first()).toContainText('current');
  });

  // @covers REQ-TRV-018@v1
  test('lists 10 versions and no Version 1 once an 11th is created', async ({ browser }) => {
    const { page } = await aTripReadyToPlan(browser, 'eleven');
    for (let made = 1; made <= 10; made += 1) {
      await generateAndWaitForVersion(page, made);
    }
    await expect(versionList(page).getByRole('listitem')).toHaveCount(10);
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();

    await generateAndWaitForVersion(page, 11);

    await expect(versionList(page).getByRole('listitem')).toHaveCount(10);
    await expect(page.getByText('Version 1', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  });
});

test.describe('a Trip whose dates have passed', () => {
  // @covers REQ-TRV-097@v1
  test('opens showing the Trip and its Plan', async ({ browser }) => {
    const { page, email, destinationName } = await aTripReadyToPlan(browser, 'past');
    const tripName = uniqueName('Past Trip');
    const { startDate, endDate } = seedPastTripWithPlan({ ownerEmail: email, destinationName, tripName });
    expect(startDate < daysFromToday(0)).toBe(true);

    await openTrip(page, tripName);

    await expect(page.getByText(`${startDate} to ${endDate}`)).toBeVisible();
    await expect(page.getByRole('region', { name: `Day 1, ${startDate}` })).toBeVisible();
    await expect(page.getByRole('button', { name: '10:00 Past trip walk 1' })).toBeVisible();
    await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
  });
});
