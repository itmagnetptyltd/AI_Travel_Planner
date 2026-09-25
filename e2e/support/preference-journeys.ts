import { expect, type Locator, type Page } from '@playwright/test';
import { uniqueName } from './admin-journeys';
import { fillNewTrip, openTrip } from './trip-journeys';

export const STYLES = ['Relaxed', 'Balanced', 'Adventure', 'Luxury', 'Budget', 'Family', 'Business', 'Cultural'];
export const INTERESTS = [
  'History', 'Nature', 'Shopping', 'Food', 'Museums', 'Beaches',
  'Nightlife', 'Photography', 'Adventure', 'Sports', 'Local Culture', 'Architecture',
];
export const FOODS = ['No Preference', 'Vegetarian', 'Vegan', 'Halal', 'Gluten-Free', 'Other'];
export const TRANSPORT = ['Public Transport', 'Taxi', 'Rental Car', 'Walking', 'Mixed'];

export const GROUP_NAMES = ['Travel style', 'Interests', 'Food preference', 'Transportation'] as const;
export type GroupName = (typeof GROUP_NAMES)[number];

export const groupOf = (page: Page, name: string): Locator => page.getByRole('group', { name, exact: true });

/** The options a choice group offers, in the order it shows them. */
export async function expectOptions(page: Page, name: GroupName, options: readonly string[]): Promise<void> {
  await expect(groupOf(page, name).locator('label')).toHaveText([...options]);
}

export async function tick(page: Page, name: GroupName, options: readonly string[]): Promise<void> {
  for (const option of options) {
    await groupOf(page, name).getByRole('checkbox', { name: option, exact: true }).check();
  }
}

/** Spelled out here on purpose: a test that reads the labels from the application would not notice one being changed. */
export const ACCOMMODATION_LABELS = {
  type: 'Accommodation type',
  budgetRange: 'Accommodation budget range',
  preferredLocation: 'Preferred accommodation location',
  rating: 'Accommodation rating',
  facilities: 'Accommodation facilities',
} as const;

type AccommodationKey = keyof typeof ACCOMMODATION_LABELS;
const ACCOMMODATION_KEYS: readonly AccommodationKey[] = ['type', 'budgetRange', 'preferredLocation', 'rating', 'facilities'];

export async function fillAccommodation(page: Page, values: Partial<Record<AccommodationKey, string>>): Promise<void> {
  const fieldset = groupOf(page, 'Accommodation preferences');
  for (const key of ACCOMMODATION_KEYS) {
    const text = values[key];
    if (text !== undefined) await fieldset.getByLabel(ACCOMMODATION_LABELS[key], { exact: true }).fill(text);
  }
}

export interface ChoicesToMake {
  readonly ticks?: Partial<Record<GroupName, readonly string[]>>;
  readonly accommodation?: Partial<Record<AccommodationKey, string>>;
}

/** Fills the new-Trip form, ticks and types what is asked, and presses Create Trip. Returns the Trip's name. */
export async function createTripChoosing(page: Page, destinationName: string, choices: ChoicesToMake): Promise<string> {
  const tripName = uniqueName('Preferences trip');
  await fillNewTrip(page, { name: tripName, destinationName });
  for (const name of GROUP_NAMES) {
    const options = choices.ticks?.[name];
    if (options) await tick(page, name, options);
  }
  if (choices.accommodation) await fillAccommodation(page, choices.accommodation);
  await page.getByRole('button', { name: 'Create Trip' }).click();
  return tripName;
}

/** Creates a Trip choosing `choices`, waits for it to be listed, and opens it. */
export async function aTripChoosing(page: Page, destinationName: string, choices: ChoicesToMake): Promise<string> {
  const tripName = await createTripChoosing(page, destinationName, choices);
  await expect(page.getByRole('row', { name: new RegExp(tripName) })).toBeVisible();
  await openTrip(page, tripName);
  return tripName;
}

/** The text of the newest stored AI request, as an Administrator reads it. */
export async function newestStoredRequestText(admin: Page): Promise<string> {
  await admin.goto('/admin/ai-requests');
  await admin.getByRole('row').nth(1).getByRole('link', { name: 'View' }).click();
  await expect(admin.getByRole('heading', { name: 'Sent to the AI' })).toBeVisible();
  return (await admin.locator('pre').first().textContent()) ?? '';
}
