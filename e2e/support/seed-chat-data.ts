import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { E2E_DATABASE_PATH } from '../../playwright.config';
import { daysFromToday } from './trip-journeys';

const DAY_MS = 24 * 60 * 60 * 1000;

function withDatabase<T>(work: (database: Database.Database) => T): T {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.pragma('busy_timeout = 5000');
    return work(database);
  } finally {
    database.close();
  }
}

/**
 * Writes chat requests a Traveler has "already made today" straight into the e2e database, because the only
 * other way to reach the daily chat limit is to send that many messages.
 */
export function seedChatRequestsToday(ownerEmail: string, count: number): void {
  withDatabase((database) => {
    const owner = database.prepare('SELECT id FROM accounts WHERE email = ?').get(ownerEmail) as { id: string } | undefined;
    if (!owner) throw new Error('The Traveler to seed chat usage for does not exist.');
    const insert = database.prepare(
      `INSERT INTO ai_requests (id, account_id, trip_id, kind, status, request_text, reply_text, input_tokens, output_tokens, cost_micro_usd, created_at)
       VALUES (?, ?, 'seeded', 'chat', 'succeeded', NULL, NULL, 0, 0, 0, ?)`,
    );
    for (let made = 0; made < count; made += 1) insert.run(randomUUID(), owner.id, Date.now());
  });
}

/**
 * Writes a Trip that was deleted `daysAgo` days ago, with a Plan and a two-message chat, straight into the e2e
 * database. A browser cannot make one: deleting a Trip stamps it with today. Returns the Trip's name.
 */
export function seedDeletedTrip(options: {
  readonly ownerEmail: string;
  readonly destinationName: string;
  readonly tripName: string;
  readonly daysAgo: number;
}): void {
  withDatabase((database) => {
    const owner = database.prepare('SELECT id FROM accounts WHERE email = ?').get(options.ownerEmail) as { id: string } | undefined;
    const destination = database.prepare('SELECT id FROM destinations WHERE name = ?').get(options.destinationName) as { id: string } | undefined;
    if (!owner || !destination) throw new Error('The Traveler or the Destination to seed a deleted Trip for does not exist.');

    const tripId = randomUUID();
    const now = Date.now();
    const deletedAt = now - options.daysAgo * DAY_MS;
    database
      .prepare(
        `INSERT INTO trips (id, owner_account_id, name, destination_id, start_date, end_date, adults, children, budget, currency, travel_styles, status, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 2, 0, 3000, 'USD', '[]', 'Planned', ?, ?, ?)`,
      )
      .run(tripId, owner.id, options.tripName, destination.id, daysFromToday(20), daysFromToday(21), deletedAt, deletedAt - DAY_MS, deletedAt);

    const plan = {
      currency: 'USD',
      days: [1, 2].map((dayNumber) => ({
        dayNumber,
        date: daysFromToday(19 + dayNumber),
        activities: [
          {
            id: `seeded-${dayNumber}`,
            title: `Seeded walk ${dayNumber}`,
            startTime: '10:00',
            durationMinutes: 60,
            estimatedCost: 0,
            location: 'Old town',
            reason: 'A gentle start to the day.',
            category: 'Activities',
            changedByHand: false,
          },
        ],
      })),
      stay: { accommodationType: 'Hotel', suggestedArea: 'Old town', nightlyCostEstimate: 120 },
    };
    database
      .prepare(`INSERT INTO plan_versions (id, trip_id, version_number, source, plan_json, created_at) VALUES (?, ?, 1, 'generation', ?, ?)`)
      .run(randomUUID(), tripId, JSON.stringify(plan), deletedAt - DAY_MS);

    const message = database.prepare(
      `INSERT INTO chat_messages (id, trip_id, seq, role, text, proposal_json, proposal_status, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
    );
    message.run(randomUUID(), tripId, 1, 'traveler', 'Is the old town busy?', deletedAt - DAY_MS);
    message.run(randomUUID(), tripId, 2, 'assistant', 'Only at midday.', deletedAt - DAY_MS);
  });
}
