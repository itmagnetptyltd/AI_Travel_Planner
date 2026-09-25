import { describe, expect, test } from 'vitest';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createTripService } from '../../src/server/trips/trip-service';
import { aDestination } from '../support/a-destination';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';

function aTripListRig() {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const trips = createTripService({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const tokyo = destinations.add(aDestination({ name: 'Tokyo', country: 'Japan' })).id;
  const paris = destinations.add(aDestination({ name: 'Paris', country: 'France' })).id;
  const ownerId = anOwner(db);
  const add = (owner: string, destinationId: string, overrides: Parameters<typeof aTripInput>[1]) => {
    const created = trips.create(owner, aTripInput(destinationId, overrides));
    if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
    return created.trip;
  };
  return { db, trips, tokyo, paris, ownerId, add };
}

const names = (list: readonly { readonly name: string }[]) => list.map((trip) => trip.name);

describe('listing the Trips of one Traveler with a search or a filter', () => {
  // @covers REQ-TRV-076@v1
  test('returns only the matching Trips of the owner, sorted by name', () => {
    const { trips, tokyo, paris, ownerId, add } = aTripListRig();
    add(ownerId, paris, { name: 'Paris Weekend' });
    add(ownerId, tokyo, { name: 'Tokyo Winter' });
    add(ownerId, tokyo, { name: 'Tokyo Family Holiday' });

    expect(names(trips.listForOwner(ownerId, { search: 'Tokyo' }))).toEqual(['Tokyo Family Holiday', 'Tokyo Winter']);
  });

  // @covers REQ-TRV-076@v1
  test('lists every Trip, as before, when no filter is given', () => {
    const { trips, tokyo, paris, ownerId, add } = aTripListRig();
    add(ownerId, paris, { name: 'Paris Weekend' });
    add(ownerId, tokyo, { name: 'Tokyo Family Holiday' });

    expect(names(trips.listForOwner(ownerId))).toEqual(['Paris Weekend', 'Tokyo Family Holiday']);
    expect(names(trips.listForOwner(ownerId, {}))).toEqual(['Paris Weekend', 'Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-077@v1
  test('works out the length of each Trip from its dates', () => {
    const { trips, tokyo, ownerId, add } = aTripListRig();
    add(ownerId, tokyo, { name: 'Three days', startDate: '2026-10-10', endDate: '2026-10-12' });
    add(ownerId, tokyo, { name: 'Eight days', startDate: '2026-10-10', endDate: '2026-10-17' });

    expect(names(trips.listForOwner(ownerId, { minDays: 6 }))).toEqual(['Eight days']);
  });

  // @covers REQ-TRV-077@v1
  test('filters by travel style, country and Destination', () => {
    const { trips, tokyo, paris, ownerId, add } = aTripListRig();
    add(ownerId, tokyo, { name: 'Family one', travelStyles: ['Family'] });
    add(ownerId, paris, { name: 'Business one', travelStyles: ['Business'] });

    expect(names(trips.listForOwner(ownerId, { style: 'Family' }))).toEqual(['Family one']);
    expect(names(trips.listForOwner(ownerId, { country: 'France' }))).toEqual(['Business one']);
    expect(names(trips.listForOwner(ownerId, { destination: tokyo }))).toEqual(['Family one']);
  });

  // @covers REQ-TRV-007@v2
  test("never returns another Traveler's Trip, or a deleted one, whatever the filter", () => {
    const { db, trips, tokyo, ownerId, add } = aTripListRig();
    const other = anOwner(db);
    add(ownerId, tokyo, { name: 'Tokyo mine' });
    add(other, tokyo, { name: 'Tokyo theirs' });
    const deleted = add(ownerId, tokyo, { name: 'Tokyo deleted' });
    trips.softDelete(ownerId, deleted.id);

    expect(names(trips.listForOwner(ownerId, { search: 'Tokyo' }))).toEqual(['Tokyo mine']);
    expect(names(trips.listForOwner(ownerId, { country: 'Japan' }))).toEqual(['Tokyo mine']);
    expect(names(trips.listForOwner(other, {}))).toEqual(['Tokyo theirs']);
  });
});
