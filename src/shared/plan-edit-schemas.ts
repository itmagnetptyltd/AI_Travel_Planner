import { z } from 'zod';
import { ACTIVITY_CATEGORIES } from './plan-schemas';
import { toOneLine } from './trip-preferences';

const TITLE_MAX = 200;
const LOCATION_MAX = 200;
const REASON_MAX = 1000;
const MAX_MINUTES_IN_A_DAY = 24 * 60;
const MAX_COST = 10_000_000;

/** Text the Traveler types is kept on one line, so it can never begin a line of its own in a later AI request. */
const oneLine = (max: number) => z.string().transform(toOneLine).pipe(z.string().min(1).max(max));

const startTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const activityFields = {
  title: oneLine(TITLE_MAX),
  startTime,
  durationMinutes: z.number().int().min(1).max(MAX_MINUTES_IN_A_DAY),
  estimatedCost: z.number().int().min(0).max(MAX_COST),
  location: oneLine(LOCATION_MAX),
  category: z.enum(ACTIVITY_CATEGORIES),
};

/** Any subset of an Activity's fields, and at least one of them. */
export const activityEditSchema = z
  .object(activityFields)
  .partial()
  .strict()
  .refine((edit) => Object.keys(edit).length > 0, { message: 'Nothing to change.' });

/** An Activity typed in, or an AI suggestion accepted. `fromSuggestion` says which, so it is not marked as changed by hand. */
export const newActivitySchema = z
  .object({
    ...activityFields,
    category: activityFields.category.optional(),
    reason: oneLine(REASON_MAX).optional(),
    fromSuggestion: z.boolean().optional(),
  })
  .strict();

export const moveActivitySchema = z.object({ toDay: z.number().int().min(1) }).strict();

export type ActivityEditInput = z.infer<typeof activityEditSchema>;
export type NewActivityInput = z.infer<typeof newActivitySchema>;
