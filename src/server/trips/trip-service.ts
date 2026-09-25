import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { destinations, trips } from '../db/schema';
import {
  areTripDatesValid,
  TRIP_RESTORE_DAYS,
  tripDayCount,
  type DeletedTrip,
  type TripInput,
  type TripUpdate,
  type TripView,
} from '../../shared/trip-schemas';
import { ACCOMMODATION_FIELDS, type AccommodationPreferences } from '../../shared/trip-preferences';

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
  /** The Trip as it would be after `change`, checked exactly as `update` checks it, without saving anything. */
  preview(ownerId: string, id: string, change: TripUpdate): TripResult;
  update(ownerId: string, id: string, change: TripUpdate): TripResult;
  /** Soft delete: the row stays, so the Trip still holds its Destination. False when nothing was deleted. */
  softDelete(ownerId: string, id: string): boolean;
  /** The owner's Trips deleted less than 30 days ago, most recently deleted first. */
  listDeleted(ownerId: string): readonly DeletedTrip[];
  /** Brings a Trip deleted less than 30 days ago back, with its Plan and chat. Anything else reads as not found. */
  restore(ownerId: string, id: string): TripResult;
  /** Removes for good every Trip deleted 30 days ago or more, with its Plans and chat. Returns how many. */
  purgeExpired(): number;
}

type TripRow = typeof trips.$inferSelect;

const invalid = (field: TripField): TripResult => ({ ok: false, error: 'invalid', field });
const NOT_FOUND: TripResult = { ok: false, error: 'not-found' };
const DAY_MS = 24 * 60 * 60 * 1000;

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
  /** A Trip deleted before this can no longer be restored, and is removed for good. */
  const restoreCutoff = () => new Date(clock.now().getTime() - TRIP_RESTORE_DAYS * DAY_MS);
  const restorableRow = (ownerId: string, id: string) =>
    db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.ownerAccountId, ownerId), gt(trips.deletedAt, restoreCutoff())))
      .get();
  const preview: TripService['preview'] = (ownerId, id, change) => {
    const existing = ownedRow(ownerId, id);
    if (!existing) return NOT_FOUND;
    const problem = changeProblem(existing, change, today(), isEnabledDestination);
    return problem ? invalid(problem) : { ok: true, trip: view({ ...existing, ...pickTripFields(change) }) };
  };

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
        interests: [...(input.interests ?? [])],
        foodPreferences: [...(input.foodPreferences ?? [])],
        transportation: [...(input.transportation ?? [])],
        accommodation: accommodationOf(input.accommodation),
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

    preview,

    update(ownerId, id, change) {
      const previewed = preview(ownerId, id, change);
      if (!previewed.ok) return previewed;
      db.update(trips)
        .set({ ...pickTripFields(change), updatedAt: clock.now() })
        .where(eq(trips.id, id))
        .run();
      const updated = ownedRow(ownerId, id);
      return updated ? { ok: true, trip: view(updated) } : NOT_FOUND;
    },

    listDeleted(ownerId) {
      return db
        .select()
        .from(trips)
        .where(and(eq(trips.ownerAccountId, ownerId), gt(trips.deletedAt, restoreCutoff())))
        .orderBy(desc(trips.deletedAt))
        .all()
        .flatMap((row) => {
          if (!row.deletedAt) return [];
          const purgesAt = new Date(row.deletedAt.getTime() + TRIP_RESTORE_DAYS * DAY_MS).toISOString();
          return [{ id: row.id, name: row.name, destination: destinationOf(db, row.destinationId), deletedAt: row.deletedAt.toISOString(), purgesAt }];
        });
    },

    restore(ownerId, id) {
      if (!restorableRow(ownerId, id)) return NOT_FOUND;
      db.update(trips).set({ deletedAt: null, updatedAt: clock.now() }).where(eq(trips.id, id)).run();
      const restored = ownedRow(ownerId, id);
      return restored ? { ok: true, trip: view(restored) } : NOT_FOUND;
    },

    purgeExpired() {
      return db.delete(trips).where(and(isNotNull(trips.deletedAt), lte(trips.deletedAt, restoreCutoff()))).run().changes;
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
type ServerSetFields = 'id' | 'ownerAccountId' | 'children' | 'status' | 'deletedAt' | 'createdAt' | 'updatedAt';
type PreferenceFields = 'travelStyles' | 'interests' | 'foodPreferences' | 'transportation' | 'accommodation';

function pickTripFields(input: TripInput): Omit<TripRow, ServerSetFields | PreferenceFields>;
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
    ...(input.interests !== undefined ? { interests: [...input.interests] } : {}),
    ...(input.foodPreferences !== undefined ? { foodPreferences: [...input.foodPreferences] } : {}),
    ...(input.transportation !== undefined ? { transportation: [...input.transportation] } : {}),
    ...(input.accommodation !== undefined ? { accommodation: accommodationOf(input.accommodation) } : {}),
  };
}

/**
 * Copies only the accommodation values that were given, by name. A value that is blank is not given, and
 * nothing given at all, like null, is stored as null, so "no accommodation preferences" has one form.
 */
function accommodationOf(input: TripInput['accommodation']): AccommodationPreferences | null {
  if (!input) return null;
  const given = ACCOMMODATION_FIELDS.flatMap((field) => {
    const value = input[field]?.trim();
    return value ? [[field, value] as const] : [];
  });
  return given.length === 0 ? null : Object.fromEntries(given);
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
    interests: row.interests,
    foodPreferences: row.foodPreferences,
    transportation: row.transportation,
    accommodation: row.accommodation,
    status: row.status,
  };
}
