import { eq } from 'drizzle-orm';
import type { TrvDatabase } from '../db/client';
import { destinations } from '../db/schema';
import type { TripView } from '../../shared/trip-schemas';
import { preferencesForPrompt, type PlanPromptInput } from './plan-prompt';

/**
 * What the AI is told about a Trip, read from the Trip as it is now. The Destination is looked up by id
 * whether or not it is still enabled: a Trip keeps working after its Destination is disabled (REQ-TRV-094).
 * Null only if the Destination row is gone, which a saved Trip prevents.
 */
export function promptInputForTrip(db: TrvDatabase, trip: TripView, destinationTextMaxChars: number): PlanPromptInput | null {
  const destination = db.select().from(destinations).where(eq(destinations.id, trip.destination.id)).get();
  if (!destination) return null;
  return {
    destination: {
      name: destination.name,
      country: destination.country,
      description: destination.description,
      popularActivities: destination.popularActivities,
      travelInformation: destination.travelInformation,
    },
    startDate: trip.startDate,
    endDate: trip.endDate,
    dayCount: trip.dayCount,
    adults: trip.adults,
    children: trip.children,
    budget: trip.budget,
    currency: trip.currency,
    preferences: preferencesForPrompt({
      travelStyles: trip.travelStyles,
      interests: trip.interests,
      foodPreferences: trip.foodPreferences,
      transportation: trip.transportation,
      accommodation: trip.accommodation,
    }),
    destinationTextMaxChars,
  };
}

/** Whether a Plan made for `before` still fits the Trip as it is now: same place, same dates, same currency. */
export const isStillTheSameTrip = (before: TripView, now: TripView): boolean =>
  before.destination.id === now.destination.id &&
  before.startDate === now.startDate &&
  before.endDate === now.endDate &&
  before.currency === now.currency;
