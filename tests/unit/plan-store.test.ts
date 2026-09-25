import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'vitest';
import { openDatabase, type TrvDatabase } from '../../src/server/db/client';
import { planVersions, trips } from '../../src/server/db/schema';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import { MAX_PLAN_VERSIONS } from '../../src/shared/plan-schemas';
import { aDestination } from '../support/a-destination';
import { aPlanView } from '../support/a-plan';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock, type FixedClock } from '../support/fixed-clock';

function aStoreOver(db: TrvDatabase, clock: FixedClock) {
  const tripService = createTripService({ db, clock });
  const destinationId = createDestinationService({ db, clock }).add(aDestination()).id;
  const created = tripService.create(anOwner(db), aTripInput(destinationId));
  if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
  const tripId = created.trip.id;
  const statusOf = () => db.select({ status: trips.status }).from(trips).where(eq(trips.id, tripId)).get()?.status;
  return { db, store: createPlanStore({ db, clock }), tripId, statusOf };
}

function aStore() {
  const clock = aFixedClock(TODAY);
  return { clock, ...aStoreOver(aTestDatabase(), clock) };
}

describe('saving a Plan', () => {
  // @covers REQ-TRV-017@v1
  test('makes a Draft Trip Planned and leaves its version list at exactly one version', () => {
    const { store, tripId, statusOf } = aStore();
    expect(statusOf()).toBe('Draft');

    const saved = store.save(tripId, aPlanView(), 'generation');

    expect(statusOf()).toBe('Planned');
    expect(saved.version).toBe(1);
    expect(store.listVersions(tripId)).toEqual([{ version: 1, createdAt: TODAY.toISOString(), source: 'generation' }]);
  });

  // @covers REQ-TRV-017@v1
  test('shows the saved Plan as the current one', () => {
    const { store, tripId } = aStore();
    const plan = aPlanView();

    store.save(tripId, plan, 'generation');

    expect(store.current(tripId)).toMatchObject({ ...plan, version: 1, source: 'generation' });
  });

  // @covers REQ-TRV-017@v1
  test('has no current Plan and no versions for a Trip that has never been saved', () => {
    const { store, tripId } = aStore();

    expect(store.current(tripId)).toBeNull();
    expect(store.listVersions(tripId)).toEqual([]);
  });

  // @covers REQ-TRV-018@v1
  test('reads a saved 8-Day Plan back with the same Days and Activities', () => {
    const { store, tripId } = aStore();
    const plan = aPlanView({ days: 8 });
    store.save(tripId, plan, 'generation');

    const read = store.current(tripId);

    expect(read?.days).toEqual(plan.days);
    expect(read?.days).toHaveLength(8);
    expect(read?.stay).toEqual(plan.stay);
  });

  // @covers REQ-TRV-018@v1
  test('makes the newest save the current Plan and keeps the earlier one in the list', () => {
    const { store, tripId } = aStore();
    store.save(tripId, aPlanView({ label: 'First' }), 'generation');
    store.save(tripId, aPlanView({ label: 'Second' }), 'generation');

    expect(store.current(tripId)?.days[0]?.activities[0]?.title).toBe('Second morning 1');
    expect(store.listVersions(tripId).map((v) => v.version)).toEqual([2, 1]);
  });
});

describe('restoring an earlier version', () => {
  // @covers REQ-TRV-018@v1
  test("makes the first version's Plan current and leaves three versions, none removed", () => {
    const { store, tripId } = aStore();
    const first = aPlanView({ label: 'First' });
    store.save(tripId, first, 'generation');
    store.save(tripId, aPlanView({ label: 'Second' }), 'generation');

    const restored = store.restore(tripId, 1);

    expect(restored).toMatchObject({ ...first, version: 3, source: 'restore' });
    expect(store.current(tripId)?.days).toEqual(first.days);
    expect(store.listVersions(tripId).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  // @covers REQ-TRV-018@v1
  test('refuses a version that does not exist and changes nothing', () => {
    const { store, tripId } = aStore();
    store.save(tripId, aPlanView(), 'generation');

    expect(store.restore(tripId, 7)).toBeNull();
    expect(store.listVersions(tripId)).toHaveLength(1);
  });
});

describe('restoring the newest version', () => {
  // @covers REQ-TRV-018@v1
  test('changes nothing: no new version is made and no older version is pushed out', () => {
    const { store, tripId } = aStore();
    for (let made = 1; made <= MAX_PLAN_VERSIONS; made += 1) {
      store.save(tripId, aPlanView({ label: `Plan ${made}` }), 'generation');
    }
    const before = store.listVersions(tripId);

    const result = store.restore(tripId, MAX_PLAN_VERSIONS);
    store.restore(tripId, MAX_PLAN_VERSIONS);

    expect(result).toMatchObject({ version: MAX_PLAN_VERSIONS, source: 'generation' });
    expect(store.listVersions(tripId)).toEqual(before);
  });
});

describe('the ten-version limit', () => {
  // @covers REQ-TRV-018@v1
  test('keeps 10 versions when an 11th is saved, and drops the oldest', () => {
    const { store, tripId } = aStore();
    for (let made = 1; made <= MAX_PLAN_VERSIONS; made += 1) {
      store.save(tripId, aPlanView({ label: `Plan ${made}` }), 'generation');
    }

    store.save(tripId, aPlanView({ label: 'Plan 11' }), 'generation');

    const versions = store.listVersions(tripId).map((v) => v.version);
    expect(versions).toHaveLength(10);
    expect(versions).not.toContain(1);
    expect(versions[0]).toBe(11);
    expect(versions[9]).toBe(2);
  });

  // @covers REQ-TRV-018@v1
  test('never gives a new version a number an earlier version had', () => {
    const { store, tripId } = aStore();
    for (let made = 1; made <= 12; made += 1) {
      store.save(tripId, aPlanView({ label: `Plan ${made}` }), 'generation');
    }

    expect(store.listVersions(tripId).map((v) => v.version)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  // @covers REQ-TRV-018@v1
  test('keeps the content of a version restored just as it was about to be dropped', () => {
    const { store, tripId } = aStore();
    const first = aPlanView({ label: 'Plan 1' });
    store.save(tripId, first, 'generation');
    for (let made = 2; made <= MAX_PLAN_VERSIONS; made += 1) {
      store.save(tripId, aPlanView({ label: `Plan ${made}` }), 'generation');
    }

    store.restore(tripId, 1);

    expect(store.current(tripId)?.days).toEqual(first.days);
    expect(store.listVersions(tripId)).toHaveLength(10);
  });
});

describe('the Trip a Plan is saved on', () => {
  // @covers REQ-TRV-017@v1
  test('is marked as changed when it becomes Planned', () => {
    const { store, tripId, clock, db } = aStore();
    const updatedAtOf = () => db.select({ at: trips.updatedAt }).from(trips).where(eq(trips.id, tripId)).get()?.at.toISOString();
    expect(updatedAtOf()).toBe(TODAY.toISOString());

    clock.advanceBy(60 * 60 * 1000);
    store.save(tripId, aPlanView(), 'generation');

    expect(updatedAtOf()).toBe(new Date(TODAY.getTime() + 60 * 60 * 1000).toISOString());
  });
});

describe('a Trip whose dates have passed', () => {
  // @covers REQ-TRV-097@v1
  test('still returns its current Plan once the clock is past its end date', () => {
    const { store, tripId, clock } = aStore();
    const plan = aPlanView();
    store.save(tripId, plan, 'generation');

    clock.advanceBy(60 * 24 * 60 * 60 * 1000);

    expect(store.current(tripId)?.days).toEqual(plan.days);
  });
});

describe('a Plan on disk', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  // @covers REQ-TRV-019@v1
  test('is returned unchanged, with its Trip Planned, after the database is closed and opened again', () => {
    const directory = mkdtempSync(join(tmpdir(), 'plan-store-'));
    directories.push(directory);
    const file = join(directory, 'trv.sqlite');
    const plan = aPlanView({ days: 8 });
    const clock = aFixedClock(TODAY);
    const first = openDatabase(file);
    let tripId = '';
    try {
      const built = aStoreOver(first.db, clock);
      tripId = built.tripId;
      built.store.save(tripId, plan, 'generation');
    } finally {
      first.close();
    }

    const second = openDatabase(file);
    try {
      const reopened = createPlanStore({ db: second.db, clock });

      expect(reopened.current(tripId)).toMatchObject({ ...plan, version: 1 });
      expect(second.db.select({ status: trips.status }).from(trips).where(eq(trips.id, tripId)).get()?.status).toBe('Planned');
    } finally {
      second.close();
    }
  });
});

describe('reading a stored Plan', () => {
  // @covers REQ-TRV-018@v1
  test('refuses a snapshot that no longer matches the shape of a Plan, rather than showing it', () => {
    const { db, store, tripId } = aStore();
    store.save(tripId, aPlanView(), 'generation');
    db.update(planVersions).set({ planJson: '{"days":"not a list"}' }).where(eq(planVersions.tripId, tripId)).run();

    expect(() => store.current(tripId)).toThrow(/stored Plan/i);
  });
});
