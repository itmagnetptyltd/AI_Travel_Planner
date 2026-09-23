import { z } from 'zod';
import { CURRENCIES } from './currencies';
import { FOOD_PREFERENCES } from './food-preferences';
import { TRAVEL_STYLES } from './travel-styles';

export const DISPLAY_NAME_MAX_LENGTH = 100;

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH).nullable(),
    preferredCurrency: z.enum(CURRENCIES).nullable(),
    defaultTravelStyle: z.enum(TRAVEL_STYLES).nullable(),
    foodPreference: z.enum(FOOD_PREFERENCES).nullable(),
  })
  .partial()
  .strict();

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
