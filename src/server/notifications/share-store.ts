import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, gte, isNotNull } from 'drizzle-orm';
import type { TrvDatabase } from '../db/client';
import { destinations, planShares, trips } from '../db/schema';
import type { Executor } from '../plans/plan-store';

export type ShareRow = typeof planShares.$inferSelect;

export interface NewShare {
  readonly tripId: string;
  readonly tokenHash: string;
  readonly recipientEmail: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** A Trip that has not been deleted, as a public link shows it. */
export interface LinkedTrip {
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly destinationName: string;
  readonly destinationCountry: string;
}

export interface ShareStore {
  insert(share: NewShare, within?: Executor): ShareRow;
  findByHash(tokenHash: string): ShareRow | null;
  listForTrip(tripId: string): ShareRow[];
  /** True when the link belongs to this Trip and was not already revoked. */
  revoke(tripId: string, shareId: string, at: Date): boolean;
  remove(shareId: string): void;
  /** How many links to another person have been made for this Trip since `since`, revoked or not. */
  countRecipientsSince(tripId: string, since: Date, within?: Executor): number;
  linkedTrip(tripId: string): LinkedTrip | null;
}

export function createShareStore(db: TrvDatabase): ShareStore {
  return {
    insert(share, within = db) {
      const row: ShareRow = { id: randomUUID(), revokedAt: null, ...share };
      within.insert(planShares).values(row).run();
      return row;
    },

    findByHash: (tokenHash) => db.select().from(planShares).where(eq(planShares.tokenHash, tokenHash)).get() ?? null,

    listForTrip: (tripId) => db.select().from(planShares).where(eq(planShares.tripId, tripId)).orderBy(asc(planShares.createdAt)).all(),

    revoke(tripId, shareId, at) {
      const row = db.select().from(planShares).where(and(eq(planShares.tripId, tripId), eq(planShares.id, shareId))).get();
      if (!row || row.revokedAt !== null) return false;
      db.update(planShares).set({ revokedAt: at }).where(eq(planShares.id, shareId)).run();
      return true;
    },

    remove(shareId) {
      db.delete(planShares).where(eq(planShares.id, shareId)).run();
    },

    countRecipientsSince(tripId, since, within = db) {
      return (
        within
          .select({ made: count() })
          .from(planShares)
          .where(and(eq(planShares.tripId, tripId), isNotNull(planShares.recipientEmail), gte(planShares.createdAt, since)))
          .get()?.made ?? 0
      );
    },

    linkedTrip(tripId) {
      const row = db
        .select({
          name: trips.name,
          startDate: trips.startDate,
          endDate: trips.endDate,
          deletedAt: trips.deletedAt,
          destinationName: destinations.name,
          destinationCountry: destinations.country,
        })
        .from(trips)
        .innerJoin(destinations, eq(destinations.id, trips.destinationId))
        .where(eq(trips.id, tripId))
        .get();
      if (!row || row.deletedAt !== null) return null;
      return { name: row.name, startDate: row.startDate, endDate: row.endDate, destinationName: row.destinationName, destinationCountry: row.destinationCountry };
    },
  };
}
