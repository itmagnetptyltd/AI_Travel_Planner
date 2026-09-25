import { z } from 'zod';
import { FOOD_PREFERENCES } from './food-preferences';
import { TRAVEL_STYLES } from './travel-styles';

/** BRD v1.0 §7. */
export const INTERESTS = [
  'History',
  'Nature',
  'Shopping',
  'Food',
  'Museums',
  'Beaches',
  'Nightlife',
  'Photography',
  'Adventure',
  'Sports',
  'Local Culture',
  'Architecture',
] as const;

export type Interest = (typeof INTERESTS)[number];

/** BRD v1.0 §7. */
export const TRANSPORTATION = ['Public Transport', 'Taxi', 'Rental Car', 'Walking', 'Mixed'] as const;

export type Transportation = (typeof TRANSPORTATION)[number];

/** These two stand alone in their lists: choosing either with another value is refused (ANSWERS.md). */
export const NO_PREFERENCE = 'No Preference';
export const MIXED = 'Mixed';

/** What a Trip is planned with when the Traveler chose nothing. Applied when the request is built, never stored. */
export const DEFAULT_TRAVEL_STYLE = 'Balanced';
export const DEFAULT_FOOD_PREFERENCE = NO_PREFERENCE;
export const DEFAULT_TRANSPORTATION = MIXED;

/** The requirements name five accommodation values but give no list for any of them, so each is short free text. */
export const ACCOMMODATION_FIELDS = ['type', 'budgetRange', 'preferredLocation', 'rating', 'facilities'] as const;
export type AccommodationField = (typeof ACCOMMODATION_FIELDS)[number];
export const ACCOMMODATION_TEXT_MAX = 100;

/** How each accommodation value is named on the Trip form, the Trip page and in the Plan request. */
export const ACCOMMODATION_LABELS: Readonly<Record<AccommodationField, string>> = {
  type: 'Accommodation type',
  budgetRange: 'Accommodation budget range',
  preferredLocation: 'Preferred accommodation location',
  rating: 'Accommodation rating',
  facilities: 'Accommodation facilities',
};

export type AccommodationPreferences = { readonly [field in AccommodationField]?: string };

/** The most travel styles one Trip may have (ANSWERS.md, "One travel style, food preference and transportation per Trip, or several?"). */
export const MAX_TRAVEL_STYLES = 3;

const isDistinct = (values: readonly string[]): boolean => new Set(values).size === values.length;
const standsAlone = (value: string) => (values: readonly string[]) => !values.includes(value) || values.length === 1;

export const travelStylesSchema = z.array(z.enum(TRAVEL_STYLES)).max(MAX_TRAVEL_STYLES).refine(isDistinct);
export const interestsSchema = z.array(z.enum(INTERESTS)).refine(isDistinct);
export const foodPreferencesSchema = z.array(z.enum(FOOD_PREFERENCES)).refine(isDistinct).refine(standsAlone(NO_PREFERENCE));
export const transportationSchema = z.array(z.enum(TRANSPORTATION)).refine(isDistinct).refine(standsAlone(MIXED));

/**
 * Text on one line: every run of spaces, line breaks and other control or invisible characters becomes one
 * space. Text the Traveler types is sent to the AI, so it must not be able to start a line of its own.
 */
export const toOneLine = (text: string): string => text.replace(/[\p{C}\s]+/gu, ' ').trim();

const accommodationText = z.string().trim().max(ACCOMMODATION_TEXT_MAX).transform(toOneLine).optional();

/** `null` clears the accommodation preferences. */
export const accommodationSchema = z
  .object({
    type: accommodationText,
    budgetRange: accommodationText,
    preferredLocation: accommodationText,
    rating: accommodationText,
    facilities: accommodationText,
  })
  .strict()
  .nullable();
