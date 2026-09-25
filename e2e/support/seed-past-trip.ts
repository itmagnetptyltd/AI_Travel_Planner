import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { E2E_DATABASE_PATH } from '../../playwright.config';
import { daysFromToday } from './trip-journeys';

export interface SeededPastTrip {
  readonly startDate: string;
  readonly endDate: string;
}

/**
 * Writes a Trip whose dates have already passed, with a saved Plan, straight into the e2e database.
 * The Trip form refuses a start date before today, so a browser cannot make one, and the only thing
 * this test needs from it is that the application shows it. Used by that one test.
 */
export function seedPastTripWithPlan(options: {
  readonly ownerEmail: string;
  readonly destinationName: string;
  readonly tripName: string;
}): SeededPastTrip {
  const startDate = daysFromToday(-30);
  const endDate = daysFromToday(-26);
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.pragma('busy_timeout = 5000');
    const owner = database.prepare('SELECT id FROM accounts WHERE email = ?').get(options.ownerEmail) as { id: string } | undefined;
    const destination = database.prepare('SELECT id FROM destinations WHERE name = ?').get(options.destinationName) as
      | { id: string }
      | undefined;
    if (!owner || !destination) throw new Error('The Traveler or the Destination to seed a Trip for does not exist.');

    const tripId = randomUUID();
    const now = Date.now();
    database
      .prepare(
        `INSERT INTO trips (id, owner_account_id, name, destination_id, start_date, end_date, adults, children, budget, currency, travel_styles, status, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 2, 0, 3000, 'USD', '[]', 'Planned', NULL, ?, ?)`,
      )
      .run(tripId, owner.id, options.tripName, destination.id, startDate, endDate, now, now);

    const plan = {
      currency: 'USD',
      days: Array.from({ length: 5 }, (_, index) => ({
        dayNumber: index + 1,
        date: daysFromToday(-30 + index),
        activities: [
          {
            title: `Past trip walk ${index + 1}`,
            startTime: '10:00',
            durationMinutes: 60,
            estimatedCost: 0,
            location: 'Old town',
            reason: 'A gentle start to the day.',
            category: 'Activities',
          },
        ],
      })),
      stay: { accommodationType: 'Hotel', suggestedArea: 'Old town', nightlyCostEstimate: 120 },
    };
    database
      .prepare(
        `INSERT INTO plan_versions (id, trip_id, version_number, source, plan_json, created_at)
         VALUES (?, ?, 1, 'generation', ?, ?)`,
      )
      .run(randomUUID(), tripId, JSON.stringify(plan), now);
  } finally {
    database.close();
  }
  return { startDate, endDate };
}
