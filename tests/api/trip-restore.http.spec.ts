import { describe, expect, test } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { chatMessages, planVersions, trips as tripRows } from '../../src/server/db/schema';
import { createTripService } from '../../src/server/trips/trip-service';
import type { DeletedTrip, TripView } from '../../src/shared/trip-schemas';
import { aChatReplyText, aTravelerWithAShoppingPlan, messagesOf, readChat, sendChat } from '../support/a-chat';
import { planOf } from '../support/a-plan-edits';
import { logIn, sessionCookieFrom } from '../support/a-traveler';
import { listedTrips, aConfirmedTravelerSession } from '../support/a-trip';

const DAY = 24 * 60 * 60 * 1000;

type Ready = Awaited<ReturnType<typeof aTravelerWithAShoppingPlan>>;

const deletedList = async (ready: Ready, cookies = ready.cookies) => {
  const response = await ready.testApp.app.inject({ method: 'GET', url: '/api/trips/deleted', cookies });
  return { response, trips: (response.json() as { trips: DeletedTrip[] }).trips };
};

/** Days later the Traveler's session has expired, so they log in again, as they would. */
const loggedInAgain = async (ready: Ready) => sessionCookieFrom(await logIn(ready.testApp.app, ready.traveler));

const restore = (ready: Ready, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/restore`, cookies });

const deleteTrip = (ready: Ready) => ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });

async function aPlannedTripWithChatDeleted(): Promise<Ready> {
  const ready = await aTravelerWithAShoppingPlan();
  ready.testApp.ai.replyWith(aChatReplyText('Not in the morning.'));
  await sendChat(ready, 'Is it busy?');
  expect((await deleteTrip(ready)).statusCode).toBe(204);
  return ready;
}

const rowsFor = (ready: Ready) => ({
  trips: ready.testApp.db.select({ n: count() }).from(tripRows).where(eq(tripRows.id, ready.tripId)).get()?.n,
  versions: ready.testApp.db.select({ n: count() }).from(planVersions).where(eq(planVersions.tripId, ready.tripId)).get()?.n,
  messages: ready.testApp.db.select({ n: count() }).from(chatMessages).where(eq(chatMessages.tripId, ready.tripId)).get()?.n,
});

describe('restoring a deleted Trip', () => {
  // @covers REQ-TRV-099@v1
  test('lists a Trip deleted 10 days ago, and restoring it brings it back into the list with its Plan and its chat', async () => {
    const ready = await aPlannedTripWithChatDeleted();
    ready.testApp.clock.advanceBy(10 * DAY);
    const cookies = await loggedInAgain(ready);

    const listed = await deletedList(ready, cookies);
    expect(listed.response.statusCode).toBe(200);
    expect(listed.trips.map((t) => t.id)).toEqual([ready.tripId]);
    expect(await listedTrips(ready.testApp.app, cookies)).toEqual([]);

    const restored = await restore(ready, cookies);

    expect(restored.statusCode).toBe(200);
    expect((restored.json() as TripView).id).toBe(ready.tripId);
    expect((await listedTrips(ready.testApp.app, cookies)).map((t) => t.id)).toEqual([ready.tripId]);
    expect((await planOf(ready, cookies)).days).toEqual(ready.plan.days);
    expect(messagesOf(await readChat(ready, cookies)).map((m) => m.text)).toEqual(['Is it busy?', 'Not in the morning.']);
    expect((await deletedList(ready, cookies)).trips).toEqual([]);
  });

  // @covers REQ-TRV-099@v1
  test('offers no restore for a Trip deleted 31 days ago: it is not listed, restoring it answers 404, and nothing of it remains once purged', async () => {
    const ready = await aPlannedTripWithChatDeleted();
    ready.testApp.clock.advanceBy(31 * DAY);
    const cookies = await loggedInAgain(ready);

    expect((await deletedList(ready, cookies)).trips).toEqual([]);
    const refused = await restore(ready, cookies);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });

    createTripService({ db: ready.testApp.db, clock: ready.testApp.clock }).purgeExpired();

    expect(rowsFor(ready)).toEqual({ trips: 0, versions: 0, messages: 0 });
  });

  // @covers REQ-TRV-099@v1
  test('keeps everything of a Trip deleted 10 days ago when the purge runs', async () => {
    const ready = await aPlannedTripWithChatDeleted();
    ready.testApp.clock.advanceBy(10 * DAY);

    createTripService({ db: ready.testApp.db, clock: ready.testApp.clock }).purgeExpired();

    expect(rowsFor(ready)).toEqual({ trips: 1, versions: 1, messages: 2 });
  });

  // @covers REQ-TRV-099@v1
  test('says when each deleted Trip will be removed for good', async () => {
    const ready = await aPlannedTripWithChatDeleted();
    ready.testApp.clock.advanceBy(10 * DAY);

    const [listed] = (await deletedList(ready, await loggedInAgain(ready))).trips;

    expect(listed).toMatchObject({ id: ready.tripId, name: 'Tokyo Family Holiday' });
    expect(new Date(listed?.purgesAt ?? '').getTime() - new Date(listed?.deletedAt ?? '').getTime()).toBe(30 * DAY);
  });

  // @covers REQ-TRV-007@v2
  test("answers another Traveler with an empty list and a 404, exactly as for a Trip that does not exist", async () => {
    const ready = await aPlannedTripWithChatDeleted();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    expect((await deletedList(ready, other)).trips).toEqual([]);
    const refused = await restore(ready, other);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
    expect((await deletedList(ready)).trips).toHaveLength(1);
  });

  test('answers 404 to a restore of a Trip that is not deleted, and 401 to a caller who is not logged in', async () => {
    const ready = await aTravelerWithAShoppingPlan();

    expect((await restore(ready)).statusCode).toBe(404);
    expect((await restore(ready, {})).statusCode).toBe(401);
    expect((await deletedList(ready, {})).response.statusCode).toBe(401);
  });
});
