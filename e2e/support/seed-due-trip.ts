import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { E2E_DATABASE_PATH } from '../../playwright.config';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes a Trip whose reminder is already due straight into the e2e database: it starts two days from now and was made five
 * days ago, so its reminder point (09:00 UTC, three days before the start) has passed and it has not begun. The Trip form
 * refuses a start date this close to a Trip made this minute, and a test cannot wait three days.
 */
export function seedTripWithReminderDue(options: { readonly ownerEmail: string; readonly destinationName: string; readonly tripName: string }): void {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.pragma('busy_timeout = 5000');
    const owner = database.prepare('SELECT id FROM accounts WHERE email = ?').get(options.ownerEmail) as { id: string } | undefined;
    const destination = database.prepare('SELECT id FROM destinations WHERE name = ?').get(options.destinationName) as { id: string } | undefined;
    if (!owner || !destination) throw new Error('The Traveler or the Destination to seed a Trip for does not exist.');
    const now = Date.now();
    const startDate = new Date(now + 2 * DAY_MS).toISOString().slice(0, 10);
    const endDate = new Date(now + 5 * DAY_MS).toISOString().slice(0, 10);
    database
      .prepare(
        `INSERT INTO trips (id, owner_account_id, name, destination_id, start_date, end_date, adults, children, budget, currency, travel_styles, status, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 2, 0, 3000, 'USD', '[]', 'Draft', NULL, ?, ?)`,
      )
      .run(randomUUID(), owner.id, options.tripName, destination.id, startDate, endDate, now - 5 * DAY_MS, now - 5 * DAY_MS);
  } finally {
    database.close();
  }
}
