import { expect, test } from '@playwright/test';
import { aTravelerWithDestinations, createTrip, listedTrips, searchFilters, searchFor } from './support/search-journeys';

const TOKYO = { base: 'Tokyo', country: 'Japan' } as const;
const KYOTO = { base: 'Kyoto', country: 'Japan' } as const;
const PARIS = { base: 'Paris', country: 'France' } as const;

test.describe('searching Trips', () => {
  // @covers REQ-TRV-076@v1
  test('typing "Tokyo" leaves only "Tokyo Family Holiday" in the list', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'search-name', [TOKYO, PARIS]);
    await createTrip(page, { name: 'Tokyo Family Holiday', destination: destination('Tokyo') });
    await createTrip(page, { name: 'Paris Weekend', destination: destination('Paris') });
    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveText(['Paris Weekend', 'Tokyo Family Holiday']);

    await searchFor(page, 'Tokyo');

    await expect(listedTrips(page)).toHaveText(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-076@v1
  test('says no Trips match when the search finds nothing, and a Traveler with no Trips still hears they have none', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'search-empty', [TOKYO]);
    await page.goto('/trips');
    await expect(page.getByText('You have no Trips yet.')).toBeVisible();
    await createTrip(page, { name: 'Tokyo Family Holiday', destination: destination('Tokyo') });
    await page.goto('/trips');

    await searchFor(page, 'Sydney');

    await expect(page.getByText('No Trips match your search.')).toBeVisible();
    await expect(page.getByText('You have no Trips yet.')).toHaveCount(0);
    await expect(listedTrips(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(listedTrips(page)).toHaveText(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-076@v1
  test('keeps a space typed at the end of a search, so the next word does not run into it', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'search-space', [TOKYO]);
    await createTrip(page, { name: 'New York Trip', destination: destination('Tokyo') });
    await page.goto('/trips');
    const box = searchFilters(page).getByLabel('Search Trips', { exact: true });

    await box.pressSequentially('New ');
    await expect(page).toHaveURL(/search=New(&|$)/);
    await box.pressSequentially('York');

    await expect(box).toHaveValue('New York');
    await expect(listedTrips(page)).toHaveText(['New York Trip']);
  });

  // @covers REQ-TRV-076@v1
  test('asks the server for the whole list only once per time the page opens, when nothing is filtered', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'search-once', [TOKYO]);
    await createTrip(page, { name: 'Tokyo trip', destination: destination('Tokyo') });
    const asked = { sessions: 0, lists: 0 };
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (request.method() !== 'GET') return;
      if (pathname === '/api/sessions/current') asked.sessions += 1;
      if (pathname === '/api/trips') asked.lists += 1;
    });

    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveText(['Tokyo trip']);
    await page.waitForLoadState('networkidle');

    // The whole application opens twice in this build, so the session check shows how many times the page opened.
    expect(asked.sessions).toBeGreaterThan(0);
    expect(asked.lists).toBe(asked.sessions);
  });

  // @covers REQ-TRV-076@v1
  test('keeps the search in the address, so a reload keeps it and Back returns to the list as it was', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'search-address', [TOKYO, PARIS]);
    await createTrip(page, { name: 'Tokyo Family Holiday', destination: destination('Tokyo') });
    await createTrip(page, { name: 'Paris Weekend', destination: destination('Paris') });
    await page.goto('/trips');
    await searchFor(page, 'Tokyo');
    await expect(page).toHaveURL(/search=Tokyo/);

    await page.reload();

    await expect(searchFilters(page).getByLabel('Search Trips', { exact: true })).toHaveValue('Tokyo');
    await expect(listedTrips(page)).toHaveText(['Tokyo Family Holiday']);
    await listedTrips(page).first().click();
    await expect(page.getByRole('heading', { name: 'Tokyo Family Holiday' })).toBeVisible();
    await page.goBack();
    await expect(searchFilters(page).getByLabel('Search Trips', { exact: true })).toHaveValue('Tokyo');
    await expect(listedTrips(page)).toHaveText(['Tokyo Family Holiday']);
  });
});

test.describe('filtering Trips', () => {
  // @covers REQ-TRV-077@v1
  test('choosing the travel style Family leaves only the Family Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-style', [TOKYO]);
    await createTrip(page, { name: 'Family Trip', destination: destination('Tokyo'), style: 'Family' });
    await createTrip(page, { name: 'Business Trip', destination: destination('Tokyo'), style: 'Business' });
    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveCount(2);

    await searchFilters(page).getByLabel('Travel style', { exact: true }).selectOption('Family');

    await expect(listedTrips(page)).toHaveText(['Family Trip']);
  });

  // @covers REQ-TRV-077@v1
  test('a minimum of 6 Days leaves only the 8-Day Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-days', [TOKYO]);
    await createTrip(page, { name: 'Three days', destination: destination('Tokyo'), days: 3 });
    await createTrip(page, { name: 'Eight days', destination: destination('Tokyo'), days: 8 });
    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveCount(2);

    await searchFilters(page).getByLabel('Minimum Days', { exact: true }).fill('6');

    await expect(listedTrips(page)).toHaveText(['Eight days']);
  });

  // @covers REQ-TRV-077@v1
  test('choosing the country Japan leaves only the Kyoto Trip', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-country', [KYOTO, PARIS]);
    await createTrip(page, { name: 'Kyoto trip', destination: destination('Kyoto') });
    await createTrip(page, { name: 'Paris trip', destination: destination('Paris') });
    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveCount(2);

    await searchFilters(page).getByLabel('Country', { exact: true }).selectOption('Japan');

    await expect(listedTrips(page)).toHaveText(['Kyoto trip']);
  });

  // @covers REQ-TRV-077@v1
  test('a Destination and a budget range in one currency narrow the list, and Clear filters brings every Trip back', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-budget', [TOKYO, KYOTO]);
    await createTrip(page, { name: 'Cheap dollars', destination: destination('Tokyo'), budget: '1000', currency: 'USD' });
    await createTrip(page, { name: 'Dear dollars', destination: destination('Tokyo'), budget: '9000', currency: 'USD' });
    await createTrip(page, { name: 'Kyoto yen', destination: destination('Kyoto'), budget: '3000', currency: 'JPY' });
    await page.goto('/trips');
    await expect(listedTrips(page)).toHaveCount(3);
    const filters = searchFilters(page);

    await filters.getByLabel('Currency', { exact: true }).selectOption('USD');
    await filters.getByLabel('Maximum budget', { exact: true }).fill('2000');

    await expect(listedTrips(page)).toHaveText(['Cheap dollars']);
    await filters.getByLabel('Maximum budget', { exact: true }).fill('');
    await filters.getByLabel('Currency', { exact: true }).selectOption('');
    await filters.getByLabel('Destination', { exact: true }).selectOption({ label: `${destination('Kyoto').name}, Japan` });
    await expect(listedTrips(page)).toHaveText(['Kyoto yen']);

    await page.getByRole('button', { name: 'Clear filters' }).click();

    await expect(listedTrips(page)).toHaveCount(3);
    await expect(page).not.toHaveURL(/destination=|currency=/);
  });

  // @covers REQ-TRV-077@v1
  test('asks for a currency, in words, when a budget range is given without one', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-nocurrency', [TOKYO]);
    await createTrip(page, { name: 'Tokyo trip', destination: destination('Tokyo') });
    await page.goto('/trips');

    await searchFilters(page).getByLabel('Minimum budget', { exact: true }).fill('100');

    await expect(page.getByRole('status')).toContainText('Choose a currency for the budget');
    await expect(listedTrips(page)).toHaveText(['Tokyo trip']);
  });

  // @covers REQ-TRV-077@v1
  test('opens a bookmarked address with a filter that is not valid as a message, not as an error, and keeps the list', async ({ browser }) => {
    const { page, destination } = await aTravelerWithDestinations(browser, 'filter-bookmark', [TOKYO]);
    await createTrip(page, { name: 'Tokyo trip', destination: destination('Tokyo') });

    await page.goto('/trips?style=Sightseeing');

    await expect(page.getByRole('status')).toContainText('A filter in the address is not valid');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(listedTrips(page)).toHaveText(['Tokyo trip']);
  });
});
