import { and, asc, desc, eq, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { TrvDatabase } from '../db/client';
import { feedback, trips } from '../db/schema';
import type { AdminFeedbackView, FeedbackFilter } from '../../shared/feedback-schemas';
import { feedbackCsv } from './feedback-csv';

export interface AdminFeedbackService {
  /** All feedback, narrowed and ordered as asked. Newest first when no order is asked for. */
  list(filter: FeedbackFilter): readonly AdminFeedbackView[];
  /** The same list as CSV. */
  exportCsv(filter: FeedbackFilter): string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A keyword is plain text: the characters LIKE treats as wildcards are escaped so they match themselves. Both sides are folded
 * to lower case by `ulower`, which knows every script, so capitals never decide a match.
 */
const likePattern = (keyword: string): string => `%${keyword.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

const startOfUtcDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

function conditionsFor(filter: FeedbackFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.keyword) conditions.push(sql`ulower(${feedback.comment}) like ${likePattern(filter.keyword)} escape '\\'`);
  if (filter.rating !== undefined) conditions.push(eq(feedback.rating, filter.rating));
  if (filter.destination) conditions.push(sql`ulower(${feedback.destinationName}) = ${filter.destination.toLowerCase()}`);
  if (filter.from) conditions.push(gte(feedback.updatedAt, startOfUtcDay(filter.from)));
  if (filter.to) conditions.push(lt(feedback.updatedAt, new Date(startOfUtcDay(filter.to).getTime() + DAY_MS)));
  return conditions;
}

function orderFor(filter: FeedbackFilter): SQL[] {
  const direction = filter.order === 'asc' ? asc : desc;
  const byDate = filter.sort === 'rating' ? [desc(feedback.updatedAt)] : [direction(feedback.updatedAt)];
  return [...(filter.sort === 'rating' ? [direction(feedback.rating)] : []), ...byDate, asc(feedback.id)];
}

export function createAdminFeedbackService(deps: { readonly db: TrvDatabase }): AdminFeedbackService {
  const { db } = deps;

  const list = (filter: FeedbackFilter): readonly AdminFeedbackView[] =>
    db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        tripName: trips.name,
        destinationName: feedback.destinationName,
        destinationCountry: feedback.destinationCountry,
        updatedAt: feedback.updatedAt,
        planVersion: feedback.planVersion,
      })
      .from(feedback)
      // A Trip its owner has deleted is not named: its name may be personal, and the Trip is gone to everyone but its owner.
      .leftJoin(trips, and(eq(trips.id, feedback.tripId), isNull(trips.deletedAt)))
      .where(and(...conditionsFor(filter)))
      .orderBy(...orderFor(filter))
      .all()
      .map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        tripName: row.tripName,
        destination: { name: row.destinationName, country: row.destinationCountry },
        date: row.updatedAt.toISOString().slice(0, 10),
        planVersion: row.planVersion,
      }));

  return { list, exportCsv: (filter) => feedbackCsv(list(filter)) };
}
