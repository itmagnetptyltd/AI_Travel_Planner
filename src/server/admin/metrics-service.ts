import { and, asc, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { TrvDatabase } from '../db/client';
import { accounts, aiRequests, destinations, feedback, trips } from '../db/schema';
import { POPULAR_DESTINATIONS_LIMIT, type AdminMetrics, type MetricsRange } from '../../shared/admin-metrics';

export interface MetricsService {
  /** The seven dashboard figures. Only the AI usage follows the date range. */
  read(range: MetricsRange): AdminMetrics;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
/** Whole cents from millionths of a dollar, rounded in integers so 1.005 is never read as 1.00499… */
const dollarsFrom = (micro: number): number => Math.round(micro / 10_000) / 100;
const asNumber = (value: unknown): number => Number(value ?? 0);

export function createMetricsService(deps: { readonly db: TrvDatabase }): MetricsService {
  const { db } = deps;

  const users = (): number => db.select({ n: count() }).from(accounts).where(eq(accounts.role, 'traveler')).get()?.n ?? 0;

  const tripCounts = (): AdminMetrics['trips'] => {
    const rows = db.select({ status: trips.status, n: count() }).from(trips).where(isNull(trips.deletedAt)).groupBy(trips.status).all();
    const of = (status: string): number => rows.find((row) => row.status === status)?.n ?? 0;
    return { total: rows.reduce((sum, row) => sum + row.n, 0), draft: of('Draft'), planned: of('Planned') };
  };

  const generatedItineraries = (): number =>
    db
      .select({ n: count() })
      .from(aiRequests)
      .where(and(eq(aiRequests.kind, 'plan-generation'), eq(aiRequests.status, 'succeeded')))
      .get()?.n ?? 0;

  const popularDestinations = (): AdminMetrics['popularDestinations'] =>
    db
      .select({ name: destinations.name, country: destinations.country, trips: count() })
      .from(trips)
      .innerJoin(destinations, eq(destinations.id, trips.destinationId))
      .where(isNull(trips.deletedAt))
      .groupBy(destinations.id)
      .orderBy(desc(count()), asc(destinations.name), asc(destinations.id))
      .limit(POPULAR_DESTINATIONS_LIMIT)
      .all();

  const averageBudget = (): AdminMetrics['averageBudget'] =>
    db
      .select({ currency: trips.currency, total: sql<number>`sum(${trips.budget})`, n: count() })
      .from(trips)
      .where(isNull(trips.deletedAt))
      .groupBy(trips.currency)
      .orderBy(asc(trips.currency))
      .all()
      .map((row) => ({ currency: row.currency, amount: Math.round(asNumber(row.total) / row.n) }));

  const feedbackFigures = (): AdminMetrics['feedback'] => {
    const row = db.select({ n: count(), total: sql<number>`sum(${feedback.rating})` }).from(feedback).get();
    const n = row?.n ?? 0;
    return { count: n, averageRating: n === 0 ? null : Math.round((asNumber(row?.total) * 10) / n) / 10 };
  };

  const aiUsage = (range: MetricsRange): AdminMetrics['aiUsage'] => {
    const inRange = and(
      range.from ? gte(aiRequests.createdAt, startOfUtcDay(range.from)) : undefined,
      range.to ? lt(aiRequests.createdAt, new Date(startOfUtcDay(range.to).getTime() + DAY_MS)) : undefined,
    );
    const row = db.select({ n: count(), micro: sql<number>`sum(${aiRequests.costMicroUsd})` }).from(aiRequests).where(inRange).get();
    return {
      requests: row?.n ?? 0,
      estimatedCost: dollarsFrom(asNumber(row?.micro)),
      from: range.from ?? null,
      to: range.to ?? null,
    };
  };

  return {
    read: (range) => ({
      users: users(),
      trips: tripCounts(),
      generatedItineraries: generatedItineraries(),
      popularDestinations: popularDestinations(),
      averageBudget: averageBudget(),
      feedback: feedbackFigures(),
      aiUsage: aiUsage(range),
    }),
  };
}
