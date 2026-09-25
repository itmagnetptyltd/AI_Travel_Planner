import { expect, test, type Page } from '@playwright/test';
import { aDestinationAddedByAdministrator } from './support/trip-journeys';
import { aTravelerInNewContext, logInAsAdministrator, openAccount } from './support/admin-journeys';
import { emailsTo, logInThroughUi, waitForEmail } from './support/journeys';
import { seedTripWithReminderDue } from './support/seed-due-trip';

const switches = (page: Page) => page.getByRole('checkbox');

test.describe("a Traveler's notification switches", () => {
  // @covers REQ-TRV-060@v1
  test('are offered for Trip Created, Itinerary Updated and Trip Reminder, each on, and for nothing else', async ({ browser }) => {
    const { page, email } = await aTravelerInNewContext(browser, 'notifications', { confirmed: true });
    await logInThroughUi(page, email);
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();

    await page.goto('/profile');

    await expect(switches(page)).toHaveCount(3);
    for (const name of ['Trip Created', 'Itinerary Updated', 'Trip Reminder']) await expect(page.getByRole('checkbox', { name })).toBeChecked();
    for (const absent of [/confirm/i, /password reset/i, /shar/i]) await expect(page.getByRole('checkbox', { name: absent })).toHaveCount(0);
    await expect(page.getByText('Confirmation and password reset emails, and Plans you share, are always sent.')).toBeVisible();
  });

  // @covers REQ-TRV-060@v1
  test('a switch turned off is saved, and is still off after the page is loaded again', async ({ browser }) => {
    const { page, email } = await aTravelerInNewContext(browser, 'notifications-off', { confirmed: true });
    await logInThroughUi(page, email);
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await page.goto('/profile');

    await page.getByRole('checkbox', { name: 'Trip Reminder' }).uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();

    await expect(page.getByRole('checkbox', { name: 'Trip Reminder' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Trip Created' })).toBeChecked();
  });
});

test.describe('a page whose settings could not be loaded', () => {
  // @covers REQ-TRV-060@v1
  test('shows no switches and no Save on the Profile page, so a failed load cannot switch every email back on', async ({ browser }) => {
    const { page, email } = await aTravelerInNewContext(browser, 'notifications-failed', { confirmed: true });
    await logInThroughUi(page, email);
    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await page.route('**/api/profile', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));

    await page.goto('/profile');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(switches(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
  });

  // @covers REQ-TRV-060@v1
  test('shows no switches and no Save on the Administrator page, so a failed load cannot switch every email back on for everyone', async ({ page }) => {
    await logInAsAdministrator(page);
    await page.route('**/api/admin/notification-settings', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));

    await page.goto('/admin/notification-settings');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(switches(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0);
  });
});

test.describe("an Administrator's notification switches", () => {
  // @covers REQ-TRV-060@v1
  test('a switch turned off for everyone is saved and is still off after reloading', async ({ page }) => {
    await logInAsAdministrator(page);
    await page.goto('/admin/notification-settings');
    try {
      await page.getByRole('checkbox', { name: 'Itinerary Updated' }).uncheck();
      await page.getByRole('button', { name: 'Save settings' }).click();
      await expect(page.getByText('Notification settings saved.')).toBeVisible();
      await page.reload();

      await expect(page.getByRole('checkbox', { name: 'Itinerary Updated' })).not.toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Trip Created' })).toBeChecked();
      await expect(switches(page)).toHaveCount(3);
    } finally {
      await page.getByRole('checkbox', { name: 'Itinerary Updated' }).check();
      await page.getByRole('button', { name: 'Save settings' }).click();
      await expect(page.getByText('Notification settings saved.')).toBeVisible();
    }
  });
});

test.describe('the reminder and a disabled Traveler', () => {
  // @covers REQ-TRV-092@v1
  test('an enabled Traveler is sent the reminder for a Trip that is due, and a disabled Traveler is sent none', async ({ page, browser }) => {
    const { name: destinationName } = await aDestinationAddedByAdministrator(browser, 'Reminder Kyoto');
    const enabled = await aTravelerInNewContext(browser, 'reminder-enabled', { confirmed: true });
    const disabled = await aTravelerInNewContext(browser, 'reminder-disabled', { confirmed: true });
    await logInAsAdministrator(page);
    await openAccount(page, disabled.email);
    await page.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText('Status: Disabled')).toBeVisible();

    seedTripWithReminderDue({ ownerEmail: enabled.email, destinationName, tripName: 'Enabled traveler trip' });
    seedTripWithReminderDue({ ownerEmail: disabled.email, destinationName, tripName: 'Disabled traveler trip' });

    // The enabled Traveler's reminder shows a check has run. A second Trip, made only after that, shows a later check ran
    // too, and it would have sent the disabled Traveler's reminder had that been allowed. Only then does its absence mean anything.
    const reminder = await waitForEmail(enabled.email, /^Reminder: Enabled traveler trip/);
    seedTripWithReminderDue({ ownerEmail: enabled.email, destinationName, tripName: 'Marker trip' });
    await waitForEmail(enabled.email, /^Reminder: Marker trip/);
    expect(reminder.text).toContain('Enabled traveler trip');
    expect((await emailsTo(disabled.email)).filter((message) => /^Reminder: /.test(message.subject))).toEqual([]);
  });
});
