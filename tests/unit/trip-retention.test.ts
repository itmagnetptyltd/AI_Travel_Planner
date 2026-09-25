import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createChatStore } from '../../src/server/chat/chat-store';
import { chatMessages, planVersions, trips as tripRows } from '../../src/server/db/schema';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import { TRIP_RESTORE_DAYS } from '../../src/shared/trip-schemas';
import { aDestination } from '../support/a-destination';
import { aPlanView } from '../support/a-plan';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** A Traveler with a Trip that has a Plan and a chat, deleted `daysAgo` days before "now". */
function aTripDeleted(daysAgo: number) {
  const db = aTestDatabase();
  const clock = aFixedClock(new Date(TODAY.getTime() - daysAgo * DAY));
  const trips = createTripService({ db, clock });
  const store = createPlanStore({ db, clock });
  const chat = createChatStore({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const ownerId = anOwner(db);
  const destinationId = destinations.add(aDestination()).id;
  const created = trips.create(ownerId, aTripInput(destinationId));
  if (!created.ok) throw new Error(created.error);
  const tripId = created.trip.id;
  store.save(tripId, aPlanView({ days: 8 }), 'generation');
  chat.append(tripId, [{ role: 'traveler', text: 'Is it busy?' }, { role: 'assistant', text: 'Not in the morning.' }]);
  trips.softDelete(ownerId, tripId);
  clock.advanceBy(daysAgo * DAY);
  const counts = () => ({
    trips: db.select().from(tripRows).where(eq(tripRows.id, tripId)).all().length,
    versions: db.select().from(planVersions).where(eq(planVersions.tripId, tripId)).all().length,
    messages: db.select().from(chatMessages).where(eq(chatMessages.tripId, tripId)).all().length,
  });
  return { db, clock, trips, store, chat, destinations, ownerId, tripId, counts };
}

describe('restoring a deleted Trip', () => {
  // @covers REQ-TRV-099@v1
  test('lists a Trip deleted 10 days ago, and says when it will be removed for good', () => {
    const rig = aTripDeleted(10);

    const listed = rig.trips.listDeleted(rig.ownerId);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: rig.tripId, name: 'Tokyo Family Holiday', destination: { name: 'Kyoto' } });
    expect(listed[0]?.purgesAt).toBe(new Date(new Date(listed[0]?.deletedAt ?? '').getTime() + TRIP_RESTORE_DAYS * DAY).toISOString());
    expect(rig.trips.listForOwner(rig.ownerId)).toEqual([]);
  });

  // @covers REQ-TRV-099@v1
  test('brings a Trip deleted 10 days ago back into the list of Trips, with its Plan and its chat', () => {
    const rig = aTripDeleted(10);

    const restored = rig.trips.restore(rig.ownerId, rig.tripId);

    if (!restored.ok) throw new Error(restored.error);
    expect(restored.trip).toMatchObject({ id: rig.tripId, status: 'Planned' });
    expect(rig.trips.listForOwner(rig.ownerId).map((t) => t.id)).toEqual([rig.tripId]);
    expect(rig.store.current(rig.tripId)?.days).toHaveLength(8);
    expect(rig.chat.list(rig.tripId).map((m) => m.text)).toEqual(['Is it busy?', 'Not in the morning.']);
    expect(rig.trips.listDeleted(rig.ownerId)).toEqual([]);
  });

  // @covers REQ-TRV-099@v1
  test('does not list a Trip deleted 31 days ago, and refuses to restore it', () => {
    const rig = aTripDeleted(31);

    expect(rig.trips.listDeleted(rig.ownerId)).toEqual([]);
    expect(rig.trips.restore(rig.ownerId, rig.tripId)).toEqual({ ok: false, error: 'not-found' });
  });

  // @covers REQ-TRV-099@v1
  test('can restore a Trip at 29 days and 23 hours, and not at 30 days', () => {
    const almost = aTripDeleted(0);
    almost.clock.advanceBy(TRIP_RESTORE_DAYS * DAY - HOUR);
    const exactly = aTripDeleted(0);
    exactly.clock.advanceBy(TRIP_RESTORE_DAYS * DAY);

    expect(almost.trips.restore(almost.ownerId, almost.tripId).ok).toBe(true);
    expect(exactly.trips.listDeleted(exactly.ownerId)).toEqual([]);
    expect(exactly.trips.restore(exactly.ownerId, exactly.tripId)).toEqual({ ok: false, error: 'not-found' });
  });

  // @covers REQ-TRV-007@v2
  test("does not list or restore another Traveler's deleted Trip", () => {
    const rig = aTripDeleted(10);
    const other = anOwner(rig.db);

    expect(rig.trips.listDeleted(other)).toEqual([]);
    expect(rig.trips.restore(other, rig.tripId)).toEqual({ ok: false, error: 'not-found' });
    expect(rig.trips.listDeleted(rig.ownerId)).toHaveLength(1);
  });

  // @covers REQ-TRV-099@v1
  test('refuses to restore a Trip that was never deleted', () => {
    const rig = aTripDeleted(10);
    rig.trips.restore(rig.ownerId, rig.tripId);

    expect(rig.trips.restore(rig.ownerId, rig.tripId)).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('removing a deleted Trip for good', () => {
  // @covers REQ-TRV-099@v1
  test('leaves no Trip, no Plan version and no chat message for a Trip deleted 31 days ago', () => {
    const rig = aTripDeleted(31);
    expect(rig.counts()).toEqual({ trips: 1, versions: 1, messages: 2 });

    const removed = rig.trips.purgeExpired();

    expect(removed).toBe(1);
    expect(rig.counts()).toEqual({ trips: 0, versions: 0, messages: 0 });
  });

  // @covers REQ-TRV-035@v1
  test('leaves no chat message for a Trip that has been permanently deleted', () => {
    const rig = aTripDeleted(31);

    rig.trips.purgeExpired();

    expect(rig.chat.list(rig.tripId)).toEqual([]);
  });

  // @covers REQ-TRV-099@v1
  test('removes a Trip deleted exactly 30 days ago, and keeps one deleted 29 days ago and one never deleted', () => {
    const rig = aTripDeleted(0);
    const destinationId = rig.trips.listDeleted(rig.ownerId)[0]?.destination.id ?? '';
    const live = rig.trips.create(rig.ownerId, aTripInput(destinationId, { name: 'Still here' }));
    if (!live.ok) throw new Error(live.error);
    const later = rig.trips.create(rig.ownerId, aTripInput(destinationId, { name: 'Deleted later', startDate: '2026-12-01', endDate: '2026-12-02' }));
    if (!later.ok) throw new Error(later.error);
    rig.clock.advanceBy(DAY);
    rig.trips.softDelete(rig.ownerId, later.trip.id);
    rig.clock.advanceBy((TRIP_RESTORE_DAYS - 1) * DAY);

    rig.trips.purgeExpired();

    expect(rig.counts().trips).toBe(0);
    expect(rig.trips.listForOwner(rig.ownerId).map((t) => t.name)).toEqual(['Still here']);
    expect(rig.trips.listDeleted(rig.ownerId).map((t) => t.name)).toEqual(['Deleted later']);
  });

  // @covers REQ-TRV-099@v1
  test('lets the Destination be removed once the Trip that used it is gone, and not before', () => {
    const rig = aTripDeleted(31);
    const destinationId = rig.db.select().from(tripRows).where(eq(tripRows.id, rig.tripId)).get()?.destinationId ?? '';
    expect(rig.destinations.remove(destinationId)).toBe('in-use');

    rig.trips.purgeExpired();

    expect(rig.destinations.remove(destinationId)).toBe('removed');
  });

  // @covers REQ-TRV-099@v1
  test('purges nothing, and reports zero, when no Trip is old enough', () => {
    const rig = aTripDeleted(10);

    expect(rig.trips.purgeExpired()).toBe(0);
    expect(rig.counts()).toEqual({ trips: 1, versions: 1, messages: 2 });
  });
});
