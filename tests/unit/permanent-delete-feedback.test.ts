import { describe, expect, test } from 'vitest';
import { feedback as feedbackTable } from '../../src/server/db/schema';
import { TRIP_RESTORE_DAYS } from '../../src/shared/trip-schemas';
import { DAY } from '../support/a-day';
import { aFeedbackSetup } from '../support/a-feedback-setup';

/** A Traveler's Trip to Tokyo with feedback rated 4, "Day 2 too busy", deleted and then left for 31 days. */
function aDeletedTripWithFeedback() {
  const setup = aFeedbackSetup();
  const { tripId, ownerId } = setup.aTripWithAPlan({ destination: 'Tokyo' });
  setup.feedback.save(ownerId, tripId, { rating: 4, comment: 'Day 2 too busy' });
  setup.trips.softDelete(ownerId, tripId);
  return { ...setup, tripId, ownerId };
}

describe('feedback on a Trip that is permanently deleted', () => {
  // @covers REQ-TRV-100@v1
  test('remains with rating 4, "Day 2 too busy", Destination Tokyo and its date, after the Trip is deleted for good', () => {
    const { adminFeedback, trips, clock } = aDeletedTripWithFeedback();
    clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);

    expect(trips.purgeExpired()).toBe(1);

    expect(adminFeedback.list({})).toMatchObject([
      { rating: 4, comment: 'Day 2 too busy', destination: { name: 'Tokyo', country: 'Japan' }, date: '2026-09-23' },
    ]);
  });

  // @covers REQ-TRV-100@v1
  test('has no link to the Trip or to the Traveler once the Trip is gone: nothing in the row leads to either', () => {
    const { db, trips, clock, tripId, ownerId } = aDeletedTripWithFeedback();
    clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);
    trips.purgeExpired();

    const rows = db.select().from(feedbackTable).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tripId).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(tripId);
    expect(JSON.stringify(rows)).not.toContain(ownerId);
  });

  // @covers REQ-TRV-063@v1
  test('is read by an Administrator with no Traveler and no Trip identified', () => {
    const { adminFeedback, trips, clock, tripId, ownerId } = aDeletedTripWithFeedback();
    clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);
    trips.purgeExpired();

    const [entry] = adminFeedback.list({});

    expect(entry?.tripName).toBeNull();
    expect(JSON.stringify(entry)).not.toContain(tripId);
    expect(JSON.stringify(entry)).not.toContain(ownerId);
  });

  // @covers REQ-TRV-100@v1
  test('is still linked to its Trip while the Trip can be restored, though it no longer names the Trip', () => {
    const { adminFeedback, trips, clock, db } = aDeletedTripWithFeedback();
    clock.advanceBy((TRIP_RESTORE_DAYS - 1) * DAY);

    expect(trips.purgeExpired()).toBe(0);

    expect(db.select().from(feedbackTable).all()[0]?.tripId).not.toBeNull();
    expect(adminFeedback.list({})[0]?.tripName).toBeNull();
    expect(adminFeedback.list({})).toHaveLength(1);
  });

  // @covers REQ-TRV-100@v1
  test('keeps the other Trips\' feedback linked when one Trip is purged', () => {
    const { adminFeedback, trips, clock, aTripWithAPlan, feedback } = aDeletedTripWithFeedback();
    const other = aTripWithAPlan({ name: 'Osaka trip', destination: 'Osaka' });
    feedback.save(other.ownerId, other.tripId, { rating: 5, comment: null });
    clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);

    trips.purgeExpired();

    expect(adminFeedback.list({ sort: 'rating', order: 'asc' }).map((entry) => [entry.rating, entry.tripName])).toEqual([
      [4, null],
      [5, 'Osaka trip'],
    ]);
  });

  // @covers REQ-TRV-100@v1
  test('is kept, and not linked again, when a Trip with the same name is made afterwards', () => {
    const { adminFeedback, trips, clock, aTripWithAPlan } = aDeletedTripWithFeedback();
    clock.advanceBy((TRIP_RESTORE_DAYS + 1) * DAY);
    trips.purgeExpired();

    aTripWithAPlan({ name: 'Tokyo Family Holiday', destination: 'Tokyo', trip: { startDate: '2026-12-01', endDate: '2026-12-03' } });

    expect(adminFeedback.list({})).toHaveLength(1);
    expect(adminFeedback.list({})[0]?.tripName).toBeNull();
  });
});
