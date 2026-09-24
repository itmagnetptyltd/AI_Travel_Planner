import { z } from 'zod';

// These texts are later given to the AI as reference data, which the client
// asked to be length-limited.
export const DESTINATION_LIMITS = Object.freeze({
  name: 100,
  country: 100,
  description: 2000,
  popularActivities: 1000,
  travelInformation: 2000,
  minDurationDays: 1,
  maxDurationDays: 60,
  searchQuery: 100,
});

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const destinationInputSchema = z
  .object({
    name: requiredText(DESTINATION_LIMITS.name),
    country: requiredText(DESTINATION_LIMITS.country),
    description: requiredText(DESTINATION_LIMITS.description),
    popularActivities: requiredText(DESTINATION_LIMITS.popularActivities),
    recommendedDurationDays: z
      .number()
      .int()
      .min(DESTINATION_LIMITS.minDurationDays)
      .max(DESTINATION_LIMITS.maxDurationDays),
    travelInformation: requiredText(DESTINATION_LIMITS.travelInformation),
  })
  .strict();

export const destinationUpdateSchema = destinationInputSchema.partial().strict();

export const destinationSearchSchema = z
  .object({ q: z.string().trim().max(DESTINATION_LIMITS.searchQuery).default('') })
  .strict();

export type DestinationInput = z.infer<typeof destinationInputSchema>;
export type DestinationUpdate = z.infer<typeof destinationUpdateSchema>;
