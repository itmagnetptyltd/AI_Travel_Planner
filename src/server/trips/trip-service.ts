import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { destinations, trips } from '../db/schema';
import {
  areTripDatesValid,
  tripDayCount,
  type TripInput,
  type TripUpdate,
  type TripView,
} from '../../shared/trip-schemas';

export type TripField = 'destinationId' | 'startDate' | 'endDate';

/** Expected failures are results, not exceptions. */
export type TripResult =
  | { readonly ok: true; readonly trip: TripView }
  | { readonly ok: false; readonly error: 'invalid'; readonly field: TripField }
  | { readonly ok: false; readonly error: 'not-found' };

export interface TripService {
  create(ownerId: string, input: TripInput): TripResult;
  listForOwner(ownerId: string): readonly TripView[];
  /** Absent, deleted and someone else's Trip all read as null (REQ-TRV-007). */
  getForOwner(ownerId: string, id: string): TripView | null;
  update(ownerId: string, id: string, change: TripUpdate): TripResult;
  /** Soft delete: the row stays, so the Trip still holds its Destination. False when nothing was deleted. */
  softDelete(ownerId: string, id: string): boolean;
}

type TripRow = typeof trips.$inferSelect;

const invalid = (field: TripField): TripResult => ({ ok: false, error: 'invalid', field });
const NOT_FOUND: TripResult = { ok: false, error: 'not-found' };

export function createTripService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): TripService {
  const { db, clock } = deps;
  /** Today as the server counts it: the UTC calendar date. */
  const today = () => clock.now().toISOString().slice(0, 10);
  const isEnabledDestination = (id: string) =>
    db
      .select({ id: destinations.id })
      .from(destinations)
      .where(and(eq(destinations.id, id), isNull(destinations.disabledAt)))
      .get() !== undefined;
  const ownedRow = (ownerId: string, id: string) =>
    db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.ownerAccountId, ownerId), isNull(trips.deletedAt)))
      .get();
  const view = (row: TripRow): TripView => toView(row, destinationOf(db, row.destinationId));

  return {
    create(ownerId, input) {
      if (input.startDate < today()) return invalid('startDate');
      if (!isEnabledDestination(input.destinationId)) return invalid('destinationId');
      const now = clock.now();
      const row: TripRow = {
        ...pickTripFields(input),
        id: randomUUID(),
        ownerAccountId: ownerId,
        children: input.children ?? 0,
        travelStyles: [...(input.travelStyles ?? [])],
        status: 'Draft',
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(trips).values(row).run();
      return { ok: true, trip: view(row) };
    },

    listForOwner(ownerId) {
      return db
        .select()
        .from(trips)
        .where(and(eq(trips.ownerAccountId, ownerId), isNull(trips.deletedAt)))
        .orderBy(asc(trips.name))
        .all()
        .map(view);
    },

    getForOwner(ownerId, id) {
      const row = ownedRow(ownerId, id);
      return row ? view(row) : null;
    },

    update(ownerId, id, change) {
      const existing = ownedRow(ownerId, id);
      if (!existing) return NOT_FOUND;
      const problem = changeProblem(existing, change, today(), isEnabledDestination);
      if (problem) return invalid(problem);
      db.update(trips)
        .set({ ...pickTripFields(change), updatedAt: clock.now() })
        .where(eq(trips.id, id))
        .run();
      const updated = ownedRow(ownerId, id);
      return updated ? { ok: true, trip: view(updated) } : NOT_FOUND;
    },

    softDelete(ownerId, id) {
      if (!ownedRow(ownerId, id)) return false;
      db.update(trips).set({ deletedAt: clock.now() }).where(eq(trips.id, id)).run();
      return true;
    },
  };
}

/**
 * The rules an edit must meet that the schema cannot check alone. A date may be
 * changed only to today or later; a date left as it was may already have passed.
 * A Destination must be enabled only when it is being set.
 */
function changeProblem(
  existing: TripRow,
  change: TripUpdate,
  today: string,
  isEnabledDestination: (id: string) => boolean,
): TripField | null {
  const startDate = change.startDate ?? existing.startDate;
  const endDate = change.endDate ?? existing.endDate;
  if (change.startDate !== undefined && change.startDate !== existing.startDate && change.startDate < today) {
    return 'startDate';
  }
  if (change.endDate !== undefined && change.endDate !== existing.endDate && change.endDate < today) {
    return 'endDate';
  }
  if (!areTripDatesValid(startDate, endDate)) return 'endDate';
  if (change.destinationId !== undefined && change.destinationId !== existing.destinationId) {
    return isEnabledDestination(change.destinationId) ? null : 'destinationId';
  }
  return null;
}

/** Copies only the Trip fields, by name — never the caller's whole object, and never numberOfTravelers. */
function pickTripFields(input: TripInput): Omit<TripRow, 'id' | 'ownerAccountId' | 'children' | 'travelStyles' | 'status' | 'deletedAt' | 'createdAt' | 'updatedAt'>;
function pickTripFields(input: TripUpdate): Partial<TripRow>;
function pickTripFields(input: TripUpdate): Partial<TripRow> {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.destinationId !== undefined ? { destinationId: input.destinationId } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    ...(input.adults !== undefined ? { adults: input.adults } : {}),
    ...(input.children !== undefined ? { children: input.children } : {}),
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
    ...(input.travelStyles !== undefined ? { travelStyles: [...input.travelStyles] } : {}),
  };
}

function destinationOf(db: TrvDatabase, id: string): TripView['destination'] {
  const destination = db
    .select({ id: destinations.id, name: destinations.name, country: destinations.country })
    .from(destinations)
    .where(eq(destinations.id, id))
    .get();
  // The foreign key restricts removal, so a saved Trip always has its Destination row.
  if (!destination) throw new Error(`Trip references missing Destination ${id}`);
  return destination;
}

function toView(row: TripRow, destination: TripView['destination']): TripView {
  return {
    id: row.id,
    name: row.name,
    destination,
    startDate: row.startDate,
    endDate: row.endDate,
    dayCount: tripDayCount(row.startDate, row.endDate),
    adults: row.adults,
    children: row.children,
    numberOfTravelers: row.adults + row.children,
    budget: row.budget,
    currency: row.currency,
    travelStyles: row.travelStyles,
    status: row.status,
  };
}
