import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { aConfirmedTravelerOnTrips, aDestinationAddedByAdministrator, daysFromToday, fillNewTrip, type TripDetails } from './trip-journeys';
import { tick } from './preference-journeys';

export interface DestinationToAdd {
  readonly base: string;
  readonly country: string;
}

/** A confirmed Traveler on their Trips page, and Destinations an Administrator has added, by their base name. */
export async function aTravelerWithDestinations(
  browser: Browser,
  label: string,
  toAdd: readonly DestinationToAdd[],
): Promise<{ readonly page: Page; readonly destination: (base: string) => { name: string; country: string } }> {
  const destinations: Record<string, { name: string; country: string }> = {};
  for (const { base, country } of toAdd) {
    const { name } = await aDestinationAddedByAdministrator(browser, base, country);
    destinations[base] = { name, country };
  }
  const page = await aConfirmedTravelerOnTrips(browser, label);
  const destination = (base: string) => {
    const found = destinations[base];
    if (!found) throw new Error(`No Destination was added for ${base}`);
    return found;
  };
  return { page, destination };
}

export interface TripToCreate {
  readonly name: string;
  readonly destination: { readonly name: string; readonly country: string };
  readonly days?: number;
  readonly style?: string;
  readonly budget?: string;
  readonly currency?: string;
}

/** Creates a Trip through the form and waits for it to be listed. Starts a week from today and lasts `days` Days (4 by default). */
export async function createTrip(page: Page, trip: TripToCreate): Promise<void> {
  const details: TripDetails = {
    name: trip.name,
    destinationName: trip.destination.name,
    country: trip.destination.country,
    endDate: daysFromToday(7 + (trip.days ?? 4) - 1),
    ...(trip.budget === undefined ? {} : { budget: trip.budget }),
    ...(trip.currency === undefined ? {} : { currency: trip.currency }),
  };
  await fillNewTrip(page, details);
  if (trip.style) await tick(page, 'Travel style', [trip.style]);
  await page.getByRole('button', { name: 'Create Trip' }).click();
  await expect(page.getByRole('row', { name: new RegExp(trip.name) })).toBeVisible();
}

export const searchFilters = (page: Page): Locator => page.getByRole('search', { name: 'Search and filter Trips' });

/** The names of the Trips the list is showing, in order. */
export const listedTrips = (page: Page): Locator => page.getByRole('table').getByRole('link');

export async function searchFor(page: Page, text: string): Promise<void> {
  await searchFilters(page).getByLabel('Search Trips', { exact: true }).fill(text);
}
