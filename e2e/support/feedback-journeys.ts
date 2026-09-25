import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, type Locator, type Page } from '@playwright/test';
import { E2E_DATABASE_PATH } from '../../playwright.config';

const DAY_MS = 24 * 60 * 60 * 1000;

export const feedbackSection = (page: Page): Locator => page.getByRole('region', { name: 'Rate this Plan' });

/** A word no other test uses, so a keyword filter finds only what this test wrote. */
export const uniqueWord = (): string => `zq${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Rates the Plan on show through the page and waits for the confirmation. */
export async function giveFeedbackThroughUi(page: Page, rating: number, comment: string): Promise<void> {
  const section = feedbackSection(page);
  await section.getByRole('radio', { name: `${rating} ${rating === 1 ? 'star' : 'stars'}` }).check();
  await section.getByLabel('Comment (optional)').fill(comment);
  await section.getByRole('button', { name: 'Save feedback' }).click();
  await expect(section.getByText('Thank you. Your feedback was saved.')).toBeVisible();
}

/**
 * Writes a Trip deleted 31 days ago, with feedback given on it, straight into the e2e database. The application removes
 * it for good within a moment (the purge runs every half second under test), and the feedback must outlive it. A browser
 * cannot wait 30 days, and cannot make a Trip that is already deleted. Returns the date the feedback carries.
 */
export function seedDeletedTripWithFeedback(options: {
  readonly ownerEmail: string;
  readonly destinationName: string;
  readonly destinationCountry: string;
  readonly rating: number;
  readonly comment: string;
}): string {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.pragma('busy_timeout = 5000');
    const owner = database.prepare('SELECT id FROM accounts WHERE email = ?').get(options.ownerEmail) as { id: string } | undefined;
    const destination = database.prepare('SELECT id FROM destinations WHERE name = ?').get(options.destinationName) as { id: string } | undefined;
    if (!owner || !destination) throw new Error('The Traveler or the Destination to seed feedback for does not exist.');
    const now = Date.now();
    const tripId = randomUUID();
    const gaveFeedbackAt = now - 40 * DAY_MS;
    // One step, so the purge that runs every half second cannot land between the Trip and its feedback.
    const seed = database.transaction(() => {
      database
      .prepare(
        `INSERT INTO trips (id, owner_account_id, name, destination_id, start_date, end_date, adults, children, budget, currency, travel_styles, status, deleted_at, created_at, updated_at)
         VALUES (?, ?, 'A Trip that is being deleted', ?, '2026-01-10', '2026-01-14', 2, 0, 3000, 'USD', '[]', 'Planned', ?, ?, ?)`,
      )
      .run(tripId, owner.id, destination.id, now - 31 * DAY_MS, now - 45 * DAY_MS, now - 31 * DAY_MS);
      database
      .prepare(
        `INSERT INTO feedback (id, trip_id, plan_version, rating, comment, destination_name, destination_country, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), tripId, options.rating, options.comment, options.destinationName, options.destinationCountry, gaveFeedbackAt, gaveFeedbackAt);
    });
    seed();
    return new Date(gaveFeedbackAt).toISOString().slice(0, 10);
  } finally {
    database.close();
  }
}
