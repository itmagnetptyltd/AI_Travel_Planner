import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { destinations, trips } from '../db/schema';
import type { DestinationInput, DestinationUpdate } from '../../shared/destination-schemas';

export const SEARCH_RESULT_LIMIT = 20;

export type DestinationRemoval = 'removed' | 'not-found' | 'in-use';

export interface Destination extends DestinationInput {
  readonly id: string;
  readonly isDisabled: boolean;
}

export interface DestinationSummary {
  readonly id: string;
  readonly name: string;
  readonly country: string;
}

export interface DestinationService {
  add(input: DestinationInput): Destination;
  edit(id: string, update: DestinationUpdate): Destination | null;
  setDisabled(id: string, isDisabled: boolean): Destination | null;
  /** Hard delete, refused while any Trip, deleted ones included, uses the Destination (REQ-TRV-095). */
  remove(id: string): DestinationRemoval;
  listForAdmin(): readonly Destination[];
  /** Enabled Destinations whose name starts with the query, case-insensitively (REQ-TRV-078). */
  search(query: string): readonly DestinationSummary[];
  /** Enabled Destinations only; a disabled one is not offered to Travelers (REQ-TRV-074). */
  getForTraveler(id: string): Destination | null;
}

export function createDestinationService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): DestinationService {
  const { db, clock } = deps;
  const findRow = (id: string) => db.select().from(destinations).where(eq(destinations.id, id)).get();
  const updated = (id: string, values: Partial<typeof destinations.$inferInsert>): Destination | null => {
    if (!findRow(id)) {
      return null;
    }
    db.update(destinations).set({ ...values, updatedAt: clock.now() }).where(eq(destinations.id, id)).run();
    const row = findRow(id);
    return row ? toDestination(row) : null;
  };

  return {
    add(input) {
      const now = clock.now();
      const row = { ...pickDestinationFields(input), id: randomUUID(), disabledAt: null, createdAt: now, updatedAt: now };
      db.insert(destinations).values(row).run();
      return toDestination(row);
    },

    edit(id, update) {
      return updated(id, pickDestinationFields(update));
    },

    setDisabled(id, isDisabled) {
      return updated(id, { disabledAt: isDisabled ? clock.now() : null });
    },

    remove(id) {
      if (db.select({ id: trips.id }).from(trips).where(eq(trips.destinationId, id)).get()) {
        return 'in-use';
      }
      return db.delete(destinations).where(eq(destinations.id, id)).run().changes > 0 ? 'removed' : 'not-found';
    },

    listForAdmin() {
      return db.select().from(destinations).orderBy(asc(destinations.name)).all().map(toDestination);
    },

    search(query) {
      const pattern = `${escapeLike(query.trim().toLowerCase())}%`;
      return db
        .select({ id: destinations.id, name: destinations.name, country: destinations.country })
        .from(destinations)
        .where(and(isNull(destinations.disabledAt), sql`lower(${destinations.name}) LIKE ${pattern} ESCAPE '\\'`))
        .orderBy(asc(destinations.name))
        .limit(SEARCH_RESULT_LIMIT)
        .all();
    },

    getForTraveler(id) {
      const row = findRow(id);
      return row && row.disabledAt === null ? toDestination(row) : null;
    },
  };
}

/** `%` and `_` in a search are literal characters, not wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Copies only the Destination fields, by name — never the caller's whole object. */
function pickDestinationFields(input: DestinationInput): DestinationInput;
function pickDestinationFields(input: DestinationUpdate): Partial<DestinationInput>;
function pickDestinationFields(input: DestinationUpdate): Partial<DestinationInput> {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.popularActivities !== undefined ? { popularActivities: input.popularActivities } : {}),
    ...(input.recommendedDurationDays !== undefined ? { recommendedDurationDays: input.recommendedDurationDays } : {}),
    ...(input.travelInformation !== undefined ? { travelInformation: input.travelInformation } : {}),
  };
}

function toDestination(row: typeof destinations.$inferSelect): Destination {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    description: row.description,
    popularActivities: row.popularActivities,
    recommendedDurationDays: row.recommendedDurationDays,
    travelInformation: row.travelInformation,
    isDisabled: row.disabledAt !== null,
  };
}
