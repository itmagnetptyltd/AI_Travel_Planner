import { expect, test } from '@playwright/test';
import { uniqueName } from './support/admin-journeys';
import {
  aConfirmedTravelerOnTrips,
  aDestinationAddedByAdministrator,
  chooseDestination,
  createTripThroughUi,
  daysFromToday,
  fillNewTrip,
  openTrip,
} from './support/trip-journeys';

test.describe('creating a Trip', () => {
  // @covers REQ-TRV-011@v2
  test('a Traveler creates a Trip, typing the start of the Destination to pick it, and sees it listed as Draft with 4 travelers', async ({
    browser,
  }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'create-trip');
    const tripName = uniqueName('Tokyo Family Holiday');

    await createTripThroughUi(page, {
      name: tripName,
      destinationName: destination,
      typed: destination.slice(0, -2),
      adults: '2',
      children: '2',
      budget: '5000',
      currency: 'USD',
    });

    const row = page.getByRole('row', { name: new RegExp(tripName) });
    await expect(row).toContainText(`${destination}, Japan`);
    await expect(row).toContainText('4 travelers');
    await expect(row).toContainText('5000 USD');
    await expect(row).toContainText('Draft');
  });

  // @covers REQ-TRV-011@v2
  test('the Trip form shows the budget note beside the budget field', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'budget-note');

    await page.goto('/trips/new');

    await expect(page.getByLabel('Budget')).toHaveAccessibleDescription(
      'One total for the whole group, covering costs at the Destination only. It excludes flights or other travel to and from the Destination.',
    );
  });

  // @covers REQ-TRV-011@v2
  test('the currency choice offers exactly the eight currencies', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'currencies');

    await page.goto('/trips/new');

    await expect(page.getByLabel('Currency').locator('option:not([value=""])')).toHaveText([
      'AUD',
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'SGD',
      'NZD',
      'BDT',
    ]);
  });

  // @covers REQ-TRV-011@v2
  test('the Trip form is pre-filled with travel style Family; changing it to Adventure leaves the profile at Family', async ({
    browser,
  }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'travel-style');
    await page.goto('/profile');
    await page.getByLabel('Default travel style').selectOption('Family');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');
    const tripName = uniqueName('Adventure trip');

    await fillNewTrip(page, { name: tripName, destinationName: destination });
    await expect(page.getByLabel('Travel style')).toHaveValue('Family');
    await page.getByLabel('Travel style').selectOption('Adventure');
    await page.getByRole('button', { name: 'Create Trip' }).click();
    await openTrip(page, tripName);

    await expect(page.getByText('Travel style: Adventure')).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByLabel('Default travel style')).toHaveValue('Family');
  });

  // @covers REQ-TRV-011@v2
  test('submitting with the name blank names the name field', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'blank-name');

    await fillNewTrip(page, { name: '', destinationName: destination });
    await page.getByRole('button', { name: 'Create Trip' }).click();

    await expect(page.getByLabel('Trip name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveText('Check the trip name.');
  });
});

test.describe('Trip dates', () => {
  // @covers REQ-TRV-012@v2
  test('an end date before the start date is shown as an error on the end date', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'end-before-start');

    await fillNewTrip(page, {
      name: uniqueName('Backwards'),
      destinationName: destination,
      startDate: daysFromToday(10),
      endDate: daysFromToday(7),
    });
    await page.getByRole('button', { name: 'Create Trip' }).click();

    await expect(page.getByLabel('End date')).toHaveAttribute('aria-invalid', 'true');
  });

  // @covers REQ-TRV-012@v2
  test('a Trip longer than 14 Days is shown as an error on the end date', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'too-long');

    await fillNewTrip(page, {
      name: uniqueName('Too long'),
      destinationName: destination,
      startDate: daysFromToday(7),
      endDate: daysFromToday(21),
    });
    await page.getByRole('button', { name: 'Create Trip' }).click();

    await expect(page.getByLabel('End date')).toHaveAttribute('aria-invalid', 'true');
  });
});

test.describe('managing saved Trips', () => {
  // @covers REQ-TRV-014@v2
  test('a Traveler renames a Trip and sees the new name in the list', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'rename');
    const before = uniqueName('Tokyo Family Holiday');
    const after = uniqueName('Tokyo Autumn');
    await createTripThroughUi(page, { name: before, destinationName: destination });

    await openTrip(page, before);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Trip name').fill(after);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await page.goto('/trips');

    await expect(page.getByRole('link', { name: after })).toBeVisible();
    await expect(page.getByRole('link', { name: before })).toHaveCount(0);
  });

  // @covers REQ-TRV-015@v2
  test('a Traveler deletes a Trip after confirming, and it leaves the list', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'delete');
    const tripName = uniqueName('Short break');
    await createTripThroughUi(page, { name: tripName, destinationName: destination });

    await openTrip(page, tripName);
    await page.getByRole('button', { name: 'Delete Trip' }).click();
    await expect(page.getByText('Delete this Trip?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, delete' }).click();

    await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
    await expect(page.getByRole('link', { name: tripName })).toHaveCount(0);
  });

  // @covers REQ-TRV-016@v1
  test('a Traveler with two Trips sees both by name', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'two-trips');
    const first = uniqueName('First trip');
    const second = uniqueName('Second trip');
    await createTripThroughUi(page, { name: first, destinationName: destination });
    await createTripThroughUi(page, { name: second, destinationName: destination });

    await page.goto('/trips');

    await expect(page.getByRole('link', { name: first })).toBeVisible();
    await expect(page.getByRole('link', { name: second })).toBeVisible();
  });

  // @covers REQ-TRV-007@v2
  test('Traveler Y opening X Trip URL sees "Trip not found" and no Trip details', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const x = await aConfirmedTravelerOnTrips(browser, 'owner-x');
    const tripName = uniqueName('Private trip');
    await createTripThroughUi(x, { name: tripName, destinationName: destination });
    await openTrip(x, tripName);
    const tripUrl = new URL(x.url()).pathname;
    const y = await aConfirmedTravelerOnTrips(browser, 'other-y');

    await y.goto(tripUrl);

    await expect(y.getByRole('heading', { name: 'Trip not found' })).toBeVisible();
    await expect(y.getByText(tripName)).toHaveCount(0);
  });
});

test.describe('save messages', () => {
  // @covers REQ-TRV-061@v1
  test('saving an edit shows a success message', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'save-ok');
    const tripName = uniqueName('Saved trip');
    await createTripThroughUi(page, { name: tripName, destinationName: destination });

    await openTrip(page, tripName);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Budget').fill('6000');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('status')).toHaveText('Trip saved.');
  });

  // @covers REQ-TRV-061@v1
  test('a failed save shows a failure message and keeps the typed values', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Tokyo');
    const page = await aConfirmedTravelerOnTrips(browser, 'save-fails');
    const tripName = uniqueName('Unsaved trip');
    await createTripThroughUi(page, { name: tripName, destinationName: destination });
    await openTrip(page, tripName);
    await page.getByRole('link', { name: 'Edit' }).click();
    // Storage cannot be broken under a running server, so the save is made to fail as storage would: a 500.
    await page.route('**/api/trips/*', async (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"INTERNAL_ERROR"}' })
        : route.continue(),
    );

    await page.getByLabel('Trip name').fill('Typed but not saved');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('alert')).toHaveText('Your Trip could not be saved. Try again.');
    await expect(page.getByLabel('Trip name')).toHaveValue('Typed but not saved');
  });
});

test.describe('Destinations on Trips', () => {
  // @covers REQ-TRV-093@v1
  test('a Destination an Administrator just added is offered on the Trip form, shown with its country', async ({ browser }) => {
    const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Kyoto');
    const page = await aConfirmedTravelerOnTrips(browser, 'offered');
    await page.goto('/trips/new');

    await chooseDestination(page, destination, destination);

    await expect(page.getByText(`Selected: ${destination}, Japan`)).toBeVisible();
  });

  // @covers REQ-TRV-095@v1
  test('an Administrator trying to remove a Destination used by a Trip sees it refused, and it stays listed', async ({
    browser,
  }) => {
    const { name: destination, admin } = await aDestinationAddedByAdministrator(browser, 'Kyoto');
    const page = await aConfirmedTravelerOnTrips(browser, 'in-use');
    await createTripThroughUi(page, { name: uniqueName('Kyoto trip'), destinationName: destination });

    await admin.goto('/admin/destinations');
    await admin.getByRole('row', { name: new RegExp(destination) }).getByRole('button', { name: 'Remove' }).click();

    await expect(admin.getByRole('alert')).toHaveText('This Destination is used by a Trip and cannot be removed.');
    await expect(admin.getByRole('row', { name: new RegExp(destination) })).toBeVisible();
  });
});
