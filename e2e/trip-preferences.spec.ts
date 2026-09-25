import { expect, test } from '@playwright/test';
import { generatePlan, setAiScript, TRIP_DAY_COUNT, aTripReadyToPlan } from './support/plan-journeys';
import {
  aTripChoosing,
  createTripChoosing,
  expectOptions,
  FOODS,
  INTERESTS,
  newestStoredRequestText,
  STYLES,
  TRANSPORT,
} from './support/preference-journeys';
import { aConfirmedTravelerOnTrips, aDestinationAddedByAdministrator, fillNewTrip, openTrip } from './support/trip-journeys';
import { uniqueName } from './support/admin-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

async function aTravelerWithADestination(browser: Parameters<typeof aDestinationAddedByAdministrator>[0], label: string) {
  const { name: destination } = await aDestinationAddedByAdministrator(browser, 'Kyoto');
  const page = await aConfirmedTravelerOnTrips(browser, label);
  return { page, destination };
}

test.describe('the travel style choice', () => {
  // @covers REQ-TRV-020@v1
  test('offers exactly Relaxed, Balanced, Adventure, Luxury, Budget, Family, Business and Cultural', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'style-options');

    await page.goto('/trips/new');

    await expectOptions(page, 'Travel style', STYLES);
  });

  // @covers REQ-TRV-020@v1
  test('a Traveler chooses Family and sees it on the Trip, then adds Cultural and sees both', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'style-save');
    const tripName = await aTripChoosing(page, destination, { ticks: { 'Travel style': ['Family'] } });
    await expect(page.getByText('Travel style: Family', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('group', { name: 'Travel style', exact: true }).getByRole('checkbox', { name: 'Cultural' }).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expect(page.getByText('Travel style: Family, Cultural', { exact: true })).toBeVisible();
  });

  // @covers REQ-TRV-020@v1
  test('four travel styles are refused with a message naming the travel style, and nothing is saved', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'style-four');

    const tripName = await createTripChoosing(page, destination, {
      ticks: { 'Travel style': ['Family', 'Cultural', 'Budget', 'Luxury'] },
    });

    await expect(page.getByRole('alert')).toHaveText('Check the travel style.');
    await page.goto('/trips');
    await expect(page.getByRole('row', { name: new RegExp(tripName) })).toHaveCount(0);
  });
});

test.describe('the interests choice', () => {
  // @covers REQ-TRV-021@v1
  test('offers exactly the twelve interests', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'interest-options');

    await page.goto('/trips/new');

    await expectOptions(page, 'Interests', INTERESTS);
  });

  // @covers REQ-TRV-021@v1
  test('a Traveler chooses History and Food and sees both on the Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'interest-save');

    await aTripChoosing(page, destination, { ticks: { Interests: ['History', 'Food'] } });

    await expect(page.getByText('Interests: History, Food', { exact: true })).toBeVisible();
  });
});

test.describe('the food preference choice', () => {
  // @covers REQ-TRV-022@v1
  test('offers exactly No Preference, Vegetarian, Vegan, Halal, Gluten-Free and Other', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'food-options');

    await page.goto('/trips/new');

    await expectOptions(page, 'Food preference', FOODS);
  });

  // @covers REQ-TRV-022@v1
  test('a Traveler chooses Halal, and another chooses Vegetarian and Gluten-Free, and each sees them on the Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'food-save');
    await aTripChoosing(page, destination, { ticks: { 'Food preference': ['Halal'] } });
    await expect(page.getByText('Food preference: Halal', { exact: true })).toBeVisible();

    await aTripChoosing(page, destination, { ticks: { 'Food preference': ['Vegetarian', 'Gluten-Free'] } });

    await expect(page.getByText('Food preference: Vegetarian, Gluten-Free', { exact: true })).toBeVisible();
  });

  // @covers REQ-TRV-022@v1
  test('No Preference together with Vegetarian is refused with a message naming the food preference', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'food-refused');

    await createTripChoosing(page, destination, { ticks: { 'Food preference': ['No Preference', 'Vegetarian'] } });

    await expect(page.getByRole('alert')).toHaveText('Check the food preference.');
  });
});

test.describe('the transportation choice', () => {
  // @covers REQ-TRV-023@v1
  test('offers exactly Public Transport, Taxi, Rental Car, Walking and Mixed', async ({ browser }) => {
    const page = await aConfirmedTravelerOnTrips(browser, 'transport-options');

    await page.goto('/trips/new');

    await expectOptions(page, 'Transportation', TRANSPORT);
  });

  // @covers REQ-TRV-023@v1
  test('a Traveler chooses Public Transport, and another Trip Public Transport and Walking, and sees them on the Trip', async ({
    browser,
  }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'transport-save');
    await aTripChoosing(page, destination, { ticks: { Transportation: ['Public Transport'] } });
    await expect(page.getByText('Transportation: Public Transport', { exact: true })).toBeVisible();

    await aTripChoosing(page, destination, { ticks: { Transportation: ['Public Transport', 'Walking'] } });

    await expect(page.getByText('Transportation: Public Transport, Walking', { exact: true })).toBeVisible();
  });

  // @covers REQ-TRV-023@v1
  test('Mixed together with Taxi is refused with a message naming the transportation', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'transport-refused');

    await createTripChoosing(page, destination, { ticks: { Transportation: ['Mixed', 'Taxi'] } });

    await expect(page.getByRole('alert')).toHaveText('Check the transportation.');
  });
});

test.describe('the accommodation preferences', () => {
  const FIVE = {
    type: 'Hotel',
    budgetRange: '100 to 200 a night',
    preferredLocation: 'near the city centre',
    rating: '4 stars or better',
    facilities: 'breakfast, wifi',
  };

  // @covers REQ-TRV-025@v1
  test('a Traveler records five accommodation values and sees the same five on the Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'accommodation-save');

    await aTripChoosing(page, destination, { accommodation: FIVE });

    await expect(page.getByText('Accommodation type: Hotel', { exact: true })).toBeVisible();
    await expect(page.getByText('Accommodation budget range: 100 to 200 a night', { exact: true })).toBeVisible();
    await expect(page.getByText('Preferred accommodation location: near the city centre', { exact: true })).toBeVisible();
    await expect(page.getByText('Accommodation rating: 4 stars or better', { exact: true })).toBeVisible();
    await expect(page.getByText('Accommodation facilities: breakfast, wifi', { exact: true })).toBeVisible();
  });

  // @covers REQ-TRV-025@v1
  test('a value over 100 characters is refused with a message naming the accommodation preferences', async ({ browser }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'accommodation-long');

    await createTripChoosing(page, destination, { accommodation: { facilities: 'x'.repeat(101) } });

    await expect(page.getByRole('alert')).toHaveText('Check the accommodation preferences.');
    const fieldset = page.getByRole('group', { name: 'Accommodation preferences', exact: true });
    await expect(fieldset.getByText('Check the accommodation preferences.')).toHaveCount(1);
    await expect(fieldset.locator('[aria-invalid="true"]')).toHaveCount(0);
  });

  // @covers REQ-TRV-025@v1
  test('the AI is sent accommodation Hotel and the location near the city centre, and the stay summary shows a type, an area and a nightly cost', async ({
    browser,
  }) => {
    const { page, admin, destinationName } = await aTripReadyToPlan(browser, 'accommodation-plan');
    await aTripChoosing(page, destinationName, { accommodation: FIVE });

    await generatePlan(page);

    await expect(page.getByText('Hotel in City centre, about 150 USD (an estimate, not a price) per night')).toBeVisible();
    const sent = await newestStoredRequestText(admin);
    expect(sent).toContain('Accommodation type: Hotel');
    expect(sent).toContain('Preferred accommodation location: near the city centre');
  });
});

test.describe('a Trip with no preferences', () => {
  // @covers REQ-TRV-096@v1
  test('is planned as Balanced, No Preference and Mixed, and the Trip still shows nothing chosen', async ({ browser }) => {
    const { page, admin } = await aTripReadyToPlan(browser, 'defaults');

    await generatePlan(page);

    await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
    await expect(page.getByText(/^Travel style:/)).toHaveCount(0);
    const sent = await newestStoredRequestText(admin);
    expect(sent).toContain('Travel style: Balanced');
    expect(sent).toContain('Food preference: No Preference');
    expect(sent).toContain('Transportation: Mixed');
  });
});

test.describe('a new Trip form', () => {
  // @covers REQ-TRV-010@v1
  test('is pre-filled with travel style Family and food preference Vegetarian from the profile, and the Traveler can change them', async ({
    browser,
  }) => {
    const { page, destination } = await aTravelerWithADestination(browser, 'prefill');
    await page.goto('/profile');
    await page.getByLabel('Default travel style').selectOption('Family');
    await page.getByLabel('Food preference').selectOption('Vegetarian');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toHaveText('Profile saved.');

    await fillNewTrip(page, { name: uniqueName('Prefilled trip'), destinationName: destination });

    await expect(page.getByRole('group', { name: 'Travel style', exact: true }).getByRole('checkbox', { name: 'Family' })).toBeChecked();
    await expect(page.getByRole('group', { name: 'Food preference', exact: true }).getByRole('checkbox', { name: 'Vegetarian' })).toBeChecked();
    await page.getByRole('group', { name: 'Food preference', exact: true }).getByRole('checkbox', { name: 'Vegan' }).check();
    await expect(page.getByRole('group', { name: 'Food preference', exact: true }).getByRole('checkbox', { name: 'Vegan' })).toBeChecked();
  });
});
