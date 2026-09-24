import { expect, test } from '@playwright/test';
import {
  addDestinationThroughUi,
  aTravelerInNewContext,
  logInAsAdministrator,
  openAccount,
  searchDestinationsThroughUi,
  uniqueName,
} from './support/admin-journeys';
import { aLoggedInTraveler, logInThroughUi } from './support/journeys';

test.describe('admin access', () => {
  // @covers REQ-TRV-068@v2
  test('a Traveler opening /admin is sent back to their Trips', async ({ page }) => {
    await aLoggedInTraveler(page, 'not-admin');

    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toHaveCount(0);
  });

  // @covers REQ-TRV-068@v2
  test('the seeded Administrator logs in and sees exactly the five admin functions', async ({ page }) => {
    await logInAsAdministrator(page);

    await page.getByRole('link', { name: 'Admin' }).click();

    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin functions' }).getByRole('listitem')).toHaveText([
      /^Users/,
      /^Destinations/,
      /^Feedback/,
      /^Notification settings/,
      /^AI usage limits/,
    ]);
  });

  // @covers REQ-TRV-068@v2
  test('an Administrator promotes a confirmed Traveler after confirming, and that Traveler can open the dashboard', async ({
    page,
    browser,
  }) => {
    const traveler = await aTravelerInNewContext(browser, 'promote', { confirmed: true });
    await logInAsAdministrator(page);

    await openAccount(page, traveler.email);
    await page.getByRole('button', { name: 'Change role' }).click();
    await expect(page.getByText(`Make ${traveler.email} an Administrator?`)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('status')).toHaveText('Role changed.');

    await logInThroughUi(traveler.page, traveler.email);
    await expect(traveler.page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await traveler.page.goto('/admin');
    await expect(traveler.page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  });
});

test.describe('managing user accounts', () => {
  // @covers REQ-TRV-071@v2
  test('an Administrator disables a Traveler, whose login is then refused, and re-enables them', async ({
    page,
    browser,
  }) => {
    const traveler = await aTravelerInNewContext(browser, 'disable', { confirmed: true });
    await logInAsAdministrator(page);

    await openAccount(page, traveler.email);
    await page.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText('Status: Disabled')).toBeVisible();
    await logInThroughUi(traveler.page, traveler.email);
    await expect(traveler.page.getByRole('alert')).toBeVisible();
    await expect(traveler.page.getByRole('heading', { name: 'Your Trips' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Re-enable' }).click();
    await expect(page.getByText('Status: Enabled')).toBeVisible();
    await logInThroughUi(traveler.page, traveler.email);
    await expect(traveler.page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  });

  // @covers REQ-TRV-071@v2
  test('an account offers view, disable and change role, and no profile edit or delete', async ({ page, browser }) => {
    const traveler = await aTravelerInNewContext(browser, 'actions', { confirmed: true });
    await logInAsAdministrator(page);

    await openAccount(page, traveler.email);

    await expect(page.getByRole('group', { name: 'Account actions' }).getByRole('button')).toHaveText([
      'Disable',
      'Change role',
    ]);
    await expect(page.getByRole('button', { name: /edit|delete/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /edit|delete/i })).toHaveCount(0);
  });
});

test.describe('Destinations', () => {
  // @covers REQ-TRV-072@v2
  test('an Administrator adds a Destination and a Traveler sees its four values on the detail view', async ({
    page,
    browser,
  }) => {
    const name = uniqueName('Kyoto');
    await logInAsAdministrator(page);
    await addDestinationThroughUi(page, name, { durationDays: 3 });
    const traveler = await (await browser.newContext()).newPage();
    await aLoggedInTraveler(traveler, 'detail');

    await searchDestinationsThroughUi(traveler, name);
    await traveler.getByRole('link', { name }).click();

    await expect(traveler.getByRole('heading', { name })).toBeVisible();
    await expect(traveler.getByText(`${name} description`)).toBeVisible();
    await expect(traveler.getByText(`${name} activities`)).toBeVisible();
    await expect(traveler.getByText('3 days')).toBeVisible();
    await expect(traveler.getByText(`${name} travel information`)).toBeVisible();
  });

  // @covers REQ-TRV-073@v1
  test('an Administrator changes the recommended duration to 4 days and the list shows 4 days', async ({ page }) => {
    const name = uniqueName('Kyoto');
    await logInAsAdministrator(page);
    await addDestinationThroughUi(page, name, { durationDays: 3 });

    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: 'Edit' }).click();
    const form = page.getByRole('form', { name: `Edit ${name}` });
    await form.getByLabel('Recommended duration (days)').fill('4');
    await form.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('4 days');
  });

  // @covers REQ-TRV-074@v2
  test('a disabled Destination is missing from Traveler search and marked disabled for the Administrator', async ({
    page,
    browser,
  }) => {
    const name = uniqueName('Kyoto');
    await logInAsAdministrator(page);
    await addDestinationThroughUi(page, name);

    await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Disable' }).click();

    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('Disabled');
    const traveler = await (await browser.newContext()).newPage();
    await aLoggedInTraveler(traveler, 'disabled-destination');
    await searchDestinationsThroughUi(traveler, name);
    await expect(traveler.getByText('No Destinations match.')).toBeVisible();
  });

  // @covers REQ-TRV-075@v2
  test('an Administrator removes an unused Destination', async ({ page }) => {
    const name = uniqueName('Kyoto');
    await logInAsAdministrator(page);
    await addDestinationThroughUi(page, name);

    await page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Remove' }).click();

    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
  });

  // @covers REQ-TRV-078@v2
  test('a Traveler searches "Kyo" and sees Kyoto and not Tokyo', async ({ page, browser }) => {
    const kyoto = uniqueName('Kyoto');
    const tokyo = uniqueName('Tokyo');
    await logInAsAdministrator(page);
    await addDestinationThroughUi(page, kyoto);
    await addDestinationThroughUi(page, tokyo);
    const traveler = await (await browser.newContext()).newPage();
    await aLoggedInTraveler(traveler, 'search');

    await searchDestinationsThroughUi(traveler, 'Kyo');

    await expect(traveler.getByRole('link', { name: kyoto })).toBeVisible();
    await expect(traveler.getByRole('link', { name: tokyo })).toHaveCount(0);
  });
});
