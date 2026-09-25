import { expect, type Browser, type Page } from '@playwright/test';
import { addDestinationThroughUi, aTravelerInNewContext, logInAsAdministrator, uniqueName } from './admin-journeys';
import { logInThroughUi } from './journeys';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar date a number of days from today, as the server counts days (UTC). */
export function daysFromToday(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/** A confirmed Traveler, logged in on their Trip list in a browser context of their own. */
export async function aConfirmedTravelerOnTrips(browser: Browser, label: string): Promise<Page> {
  const { page, email } = await aTravelerInNewContext(browser, label, { confirmed: true });
  await logInThroughUi(page, email);
  await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  return page;
}

/** An Administrator, in a context of their own, adds an enabled Destination in Japan. */
export async function aDestinationAddedByAdministrator(browser: Browser, base: string): Promise<{ name: string; admin: Page }> {
  const admin = await (await browser.newContext()).newPage();
  const name = uniqueName(base);
  await logInAsAdministrator(admin);
  await addDestinationThroughUi(admin, name);
  return { name, admin };
}

export interface TripDetails {
  readonly name: string;
  readonly destinationName: string;
  readonly typed?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly adults?: string;
  readonly children?: string;
  readonly budget?: string;
  readonly currency?: string;
}

export async function chooseDestination(page: Page, typed: string, destinationName: string): Promise<void> {
  await page.getByLabel('Destination', { exact: true }).fill(typed);
  await page
    .getByRole('list', { name: 'Destination suggestions' })
    .getByRole('button', { name: `${destinationName}, Japan` })
    .click();
}

/** Fills the new-Trip form without submitting it. */
export async function fillNewTrip(page: Page, trip: TripDetails): Promise<void> {
  await page.goto('/trips/new');
  await expect(page.getByRole('heading', { name: 'New Trip' })).toBeVisible();
  await page.getByLabel('Trip name').fill(trip.name);
  await chooseDestination(page, trip.typed ?? trip.destinationName, trip.destinationName);
  await page.getByLabel('Start date').fill(trip.startDate ?? daysFromToday(7));
  await page.getByLabel('End date').fill(trip.endDate ?? daysFromToday(10));
  await page.getByLabel('Adults').fill(trip.adults ?? '2');
  await page.getByLabel('Children').fill(trip.children ?? '0');
  await page.getByLabel('Budget').fill(trip.budget ?? '5000');
  await page.getByLabel('Currency').selectOption(trip.currency ?? 'USD');
}

export async function createTripThroughUi(page: Page, trip: TripDetails): Promise<void> {
  await fillNewTrip(page, trip);
  await page.getByRole('button', { name: 'Create Trip' }).click();
  await expect(page.getByRole('row', { name: new RegExp(trip.name) })).toBeVisible();
}

export async function openTrip(page: Page, name: string): Promise<void> {
  await page.goto('/trips');
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}
