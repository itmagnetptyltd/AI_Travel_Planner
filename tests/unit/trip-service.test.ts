import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import type { TrvDatabase } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import { createDestinationService, type DestinationService } from '../../src/server/destinations/destination-service';
import { createTripService, type TripService } from '../../src/server/trips/trip-service';
import { aTestDatabase } from '../support/build-test-app';
import { aDestination } from '../support/a-destination';
import { aFixedClock } from '../support/fixed-clock';
import { anOwner, aTripInput, aTripInputWithoutChildren, TODAY } from '../support/a-trip';

interface Harness {
  readonly db: TrvDatabase;
  readonly trips: TripService;
  readonly destinations: DestinationService;
  readonly tokyoId: string;
}

function aHarness(): Harness {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const destinations = createDestinationService({ db, clock });
  const tokyoId = destinations.add(aDestination({ name: 'Tokyo', country: 'Japan' })).id;
  return { db, trips: createTripService({ db, clock }), destinations, tokyoId };
}

function created(harness: Harness, ownerId: string, overrides: Parameters<typeof aTripInput>[1] = {}) {
  const result = harness.trips.create(ownerId, aTripInput(harness.tokyoId, overrides));
  if (!result.ok) throw new Error(`Trip not created: ${JSON.stringify(result)}`);
  return result.trip;
}

describe('creating a Trip', () => {
  // @covers REQ-TRV-011@v2
  test('a created Trip is listed with its name, Destination, dates, adults, children, budget and currency', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);

    created(harness, owner);

    expect(harness.trips.listForOwner(owner)).toEqual([
      expect.objectContaining({
        name: 'Tokyo Family Holiday',
        destination: { id: harness.tokyoId, name: 'Tokyo', country: 'Japan' },
        startDate: '2026-10-10',
        endDate: '2026-10-17',
        adults: 2,
        children: 2,
        budget: 5000,
        currency: 'USD',
      }),
    ]);
  });

  // @covers REQ-TRV-011@v2
  test('a Trip with 2 adults and 2 children has 4 travelers', () => {
    const harness = aHarness();

    const trip = created(harness, anOwner(harness.db), { adults: 2, children: 2 });

    expect(trip.numberOfTravelers).toBe(4);
  });

  // @covers REQ-TRV-011@v2
  test('a Trip to a Destination that does not exist is refused, naming destinationId', () => {
    const harness = aHarness();

    const result = harness.trips.create(anOwner(harness.db), aTripInput('atlantis'));

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'destinationId' });
  });

  // @covers REQ-TRV-011@v2
  test('a new Trip has status Draft', () => {
    const harness = aHarness();

    const trip = created(harness, anOwner(harness.db));

    expect(trip.status).toBe('Draft');
  });

  // @covers REQ-TRV-011@v2
  test('a Trip with children and preferences left blank has 0 children and no travel styles', () => {
    const harness = aHarness();
    const result = harness.trips.create(anOwner(harness.db), aTripInputWithoutChildren(harness.tokyoId));

    expect(result).toMatchObject({ ok: true, trip: { children: 0, travelStyles: [] } });
  });

  // @covers REQ-TRV-011@v2
  test('a supplied numberOfTravelers is ignored; 2 adults and 1 child read back as 3', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);

    const trip = created(harness, owner, { adults: 2, children: 1, numberOfTravelers: 5 });

    expect(harness.trips.getForOwner(owner, trip.id)?.numberOfTravelers).toBe(3);
  });

  // @covers REQ-TRV-011@v2
  test('a Trip saved with travel style Adventure leaves the profile default Family unchanged', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db, { defaultTravelStyle: 'Family' });

    const trip = created(harness, owner, { travelStyles: ['Adventure'] });

    expect(trip.travelStyles).toEqual(['Adventure']);
    expect(harness.db.select().from(accounts).where(eq(accounts.id, owner)).get()?.defaultTravelStyle).toBe('Family');
  });
});

describe('Trip dates', () => {
  // @covers REQ-TRV-012@v2
  test('a new Trip starting yesterday is refused, naming startDate', () => {
    const harness = aHarness();

    const result = harness.trips.create(
      anOwner(harness.db),
      aTripInput(harness.tokyoId, { startDate: '2026-09-22', endDate: '2026-09-25' }),
    );

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'startDate' });
  });

  // @covers REQ-TRV-012@v2
  test('a Trip starting and ending today is a 1-Day Trip', () => {
    const harness = aHarness();

    const trip = created(harness, anOwner(harness.db), { startDate: '2026-09-23', endDate: '2026-09-23' });

    expect(trip.dayCount).toBe(1);
  });

  // @covers REQ-TRV-012@v2
  test('editing a start date into the past is refused, naming startDate, and the Trip keeps its start date', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    const trip = created(harness, owner, { startDate: '2026-10-10' });

    const result = harness.trips.update(owner, trip.id, { startDate: '2026-09-20' });

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'startDate' });
    expect(harness.trips.getForOwner(owner, trip.id)?.startDate).toBe('2026-10-10');
  });

  // @covers REQ-TRV-012@v2
  test('editing an end date to before the start date is refused, naming endDate', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    const trip = created(harness, owner, { startDate: '2026-10-10', endDate: '2026-10-17' });

    const result = harness.trips.update(owner, trip.id, { endDate: '2026-10-05' });

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'endDate' });
  });
});

describe('editing a Trip', () => {
  // @covers REQ-TRV-014@v2
  test('renaming a Trip lists it under the new name', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    const trip = created(harness, owner, { name: 'Tokyo Family Holiday' });

    harness.trips.update(owner, trip.id, { name: 'Tokyo Autumn' });

    expect(harness.trips.listForOwner(owner).map((t) => t.name)).toEqual(['Tokyo Autumn']);
  });
});

describe('deleting a Trip', () => {
  // @covers REQ-TRV-015@v2
  test('a deleted Trip is no longer in its owner list', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    const trip = created(harness, owner);

    const isDeleted = harness.trips.softDelete(owner, trip.id);

    expect(isDeleted).toBe(true);
    expect(harness.trips.listForOwner(owner)).toEqual([]);
  });
});

describe('listing Trips', () => {
  // @covers REQ-TRV-016@v1
  test('a Traveler with two Trips has both listed by name', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    created(harness, owner, { name: 'Tokyo Family Holiday' });
    created(harness, owner, { name: 'Tokyo Autumn' });

    expect(harness.trips.listForOwner(owner).map((t) => t.name)).toEqual(['Tokyo Autumn', 'Tokyo Family Holiday']);
  });
});

describe('only your own Trips', () => {
  // @covers REQ-TRV-007@v2
  test('reading another Traveler Trip returns not-found', () => {
    const harness = aHarness();
    const trip = created(harness, anOwner(harness.db));

    expect(harness.trips.getForOwner(anOwner(harness.db), trip.id)).toBeNull();
  });

  // @covers REQ-TRV-007@v2
  test('updating another Traveler Trip returns not-found and changes nothing', () => {
    const harness = aHarness();
    const x = anOwner(harness.db);
    const trip = created(harness, x, { name: 'Tokyo Family Holiday' });

    const result = harness.trips.update(anOwner(harness.db), trip.id, { name: 'Taken over' });

    expect(result).toEqual({ ok: false, error: 'not-found' });
    expect(harness.trips.getForOwner(x, trip.id)?.name).toBe('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-007@v2
  test('deleting another Traveler Trip returns not-found and leaves it listed for its owner', () => {
    const harness = aHarness();
    const x = anOwner(harness.db);
    const trip = created(harness, x);

    const isDeleted = harness.trips.softDelete(anOwner(harness.db), trip.id);

    expect(isDeleted).toBe(false);
    expect(harness.trips.listForOwner(x)).toHaveLength(1);
  });

  // @covers REQ-TRV-007@v2
  test('a Traveler list holds none of another Traveler Trips', () => {
    const harness = aHarness();
    const x = anOwner(harness.db);
    const y = anOwner(harness.db);
    created(harness, x, { name: 'X trip' });
    created(harness, y, { name: 'Y trip' });

    expect(harness.trips.listForOwner(y).map((t) => t.name)).toEqual(['Y trip']);
  });
});

describe('the Trip Destination', () => {
  // @covers REQ-TRV-093@v1
  test('a Trip for an enabled Destination takes that Destination record, with its country', () => {
    const harness = aHarness();
    const kyotoId = harness.destinations.add(aDestination({ name: 'Kyoto', country: 'Japan' })).id;

    const result = harness.trips.create(anOwner(harness.db), aTripInput(kyotoId));

    expect(result).toMatchObject({ ok: true, trip: { destination: { id: kyotoId, name: 'Kyoto', country: 'Japan' } } });
  });

  // @covers REQ-TRV-093@v1
  test('a new Trip for a disabled Destination is refused, naming destinationId', () => {
    const harness = aHarness();
    const kyotoId = harness.destinations.add(aDestination({ name: 'Kyoto' })).id;
    harness.destinations.setDisabled(kyotoId, true);

    const result = harness.trips.create(anOwner(harness.db), aTripInput(kyotoId));

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'destinationId' });
  });
});

describe('removing a Destination a Trip uses', () => {
  // @covers REQ-TRV-095@v1
  test('removing a Destination used by a saved Trip is refused and leaves the Trip unchanged', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    const trip = created(harness, owner);

    const outcome = harness.destinations.remove(harness.tokyoId);

    expect(outcome).toBe('in-use');
    expect(harness.destinations.listForAdmin().map((d) => d.name)).toEqual(['Tokyo']);
    expect(harness.trips.getForOwner(owner, trip.id)).toEqual(trip);
  });

  // @covers REQ-TRV-095@v1
  test('removing a Destination used only by a deleted Trip is refused', () => {
    const harness = aHarness();
    const owner = anOwner(harness.db);
    harness.trips.softDelete(owner, created(harness, owner).id);

    const outcome = harness.destinations.remove(harness.tokyoId);

    expect(outcome).toBe('in-use');
    expect(harness.destinations.listForAdmin().map((d) => d.name)).toEqual(['Tokyo']);
  });
});
