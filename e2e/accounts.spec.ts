import { expect, test } from '@playwright/test';
import {
  aLoggedInTraveler,
  linkFromEmail,
  logInThroughUi,
  PASSWORD,
  registerThroughUi,
  uniqueEmail,
} from './support/journeys';

test.describe('registration', () => {
  // @covers REQ-TRV-001@v1
  test('the registration page shows the third-party AI privacy notice', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('note', { name: 'Privacy notice' })).toContainText(
      'third-party AI service',
    );
    await expect(page.getByRole('note', { name: 'Privacy notice' })).toContainText('outside Australia');
  });

  // @covers REQ-TRV-001@v1
  test('a visitor registers, confirms from the emailed link and reaches their Trips', async ({ page }) => {
    const email = uniqueEmail('register');

    await registerThroughUi(page, email);
    await expect(page.getByText('Check your email to confirm your address.')).toBeVisible();
    await page.goto(await linkFromEmail(email, /Confirm your email/));

    await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible();
    await logInThroughUi(page, email);
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  });

  // @covers REQ-TRV-001@v1
  test('registering with a short password shows the password field error', async ({ page }) => {
    await registerThroughUi(page, uniqueEmail('short'), 'abcdefghijk');

    await expect(page.getByText('Password must be at least 12 characters.')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('logging in and out', () => {
  // @covers REQ-TRV-002@v1
  test('a Traveler logs in and sees their list of Trips', async ({ page }) => {
    await aLoggedInTraveler(page, 'login');

    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await expect(page.getByText('You have no Trips yet.')).toBeVisible();
  });

  // @covers REQ-TRV-002@v1
  test('a Traveler resets a forgotten password from the emailed link and logs in with it', async ({ page }) => {
    const email = uniqueEmail('reset');
    await registerThroughUi(page, email);
    await expect(page.getByText('Check your email to confirm your address.')).toBeVisible();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await page.goto(await linkFromEmail(email, /Reset your password/));
    await page.getByLabel('New password').fill('violet-meadow-compass');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByText('Your password has been changed.')).toBeVisible();

    await logInThroughUi(page, email, 'violet-meadow-compass');
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  });

  // @covers REQ-TRV-003@v1
  test('logging in with a wrong password shows a login error and stays on the login page', async ({ page }) => {
    const email = uniqueEmail('wrong');
    await registerThroughUi(page, email);
    await expect(page.getByText('Check your email to confirm your address.')).toBeVisible();

    await logInThroughUi(page, email, `${PASSWORD}-wrong`);

    await expect(page.getByRole('alert')).toHaveText('Email address or password is incorrect.');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });

  // @covers REQ-TRV-004@v1
  test('after logging out, opening Trips shows the login page', async ({ page }) => {
    await aLoggedInTraveler(page, 'logout');

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/trips');

    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });

  // @covers REQ-TRV-005@v1
  test('opening a Trip page with no session shows the login page', async ({ page }) => {
    await page.goto('/trips');

    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toHaveCount(0);
  });
});

test.describe('profile', () => {
  // @covers REQ-TRV-009@v1
  test('a Traveler changes their display name and sees it after reload', async ({ page }) => {
    await aLoggedInTraveler(page, 'profile');

    await page.getByRole('link', { name: 'Profile' }).click();
    await page.getByLabel('Display name').fill('Aiko Tanaka');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await page.reload();

    await expect(page.getByLabel('Display name')).toHaveValue('Aiko Tanaka');
  });

  // @covers REQ-TRV-010@v1
  test('a Traveler sets USD, Family and Vegetarian and sees them after reload', async ({ page }) => {
    await aLoggedInTraveler(page, 'preferences');

    await page.getByRole('link', { name: 'Profile' }).click();
    await page.getByLabel('Preferred currency').selectOption('USD');
    await page.getByLabel('Default travel style').selectOption('Family');
    await page.getByLabel('Food preference').selectOption('Vegetarian');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    await page.reload();

    await expect(page.getByLabel('Preferred currency')).toHaveValue('USD');
    await expect(page.getByLabel('Default travel style')).toHaveValue('Family');
    await expect(page.getByLabel('Food preference')).toHaveValue('Vegetarian');
  });

  // @covers REQ-TRV-010@v1
  test('the preferred currency choice offers exactly the eight listed currencies', async ({ page }) => {
    await aLoggedInTraveler(page, 'currencies');

    await page.getByRole('link', { name: 'Profile' }).click();
    const options = page.getByLabel('Preferred currency').locator('option:not([value=""])');

    await expect(options).toHaveText(['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'NZD', 'BDT']);
  });
});
