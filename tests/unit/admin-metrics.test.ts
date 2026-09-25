import { describe, expect, test } from 'vitest';
import { createMetricsService } from '../../src/server/admin/metrics-service';
import { accounts } from '../../src/server/db/schema';
import { aFeedbackSetup } from '../support/a-feedback-setup';
import { anAiRequestRecord, DAY } from '../support/an-ai-request';
import { TODAY } from '../support/a-trip';

function aMetricsSetup() {
  const setup = aFeedbackSetup();
  return { ...setup, metrics: createMetricsService({ db: setup.db }) };
}

const at = (date: string) => new Date(`${date}T12:00:00Z`);

describe('the usage metrics on the admin dashboard', () => {
  // @covers REQ-TRV-069@v1
  test('show total users 3 for 3 registered Travelers, not counting an Administrator', () => {
    const { metrics, aTraveler, db } = aMetricsSetup();
    aTraveler();
    aTraveler();
    aTraveler();
    db.insert(accounts).values({ id: 'admin-1', email: 'admin@example.com', passwordHash: 'x', role: 'administrator', emailConfirmedAt: TODAY, createdAt: TODAY }).run();

    expect(metrics.read({}).users).toBe(3);
  });

  // @covers REQ-TRV-069@v1
  test('count a Traveler whose email is not confirmed or who is disabled as a user', () => {
    const { metrics, db } = aMetricsSetup();
    db.insert(accounts).values({ id: 't-1', email: 'unconfirmed@example.com', passwordHash: 'x', role: 'traveler', createdAt: TODAY }).run();
    db.insert(accounts).values({ id: 't-2', email: 'disabled@example.com', passwordHash: 'x', role: 'traveler', emailConfirmedAt: TODAY, disabledAt: TODAY, createdAt: TODAY }).run();

    expect(metrics.read({}).users).toBe(2);
  });

  // @covers REQ-TRV-069@v1
  test('show total trips 5, split as 2 Draft and 3 Planned', () => {
    const { metrics, aTripWithAPlan, aDraftTrip } = aMetricsSetup();
    for (let planned = 0; planned < 3; planned += 1) aTripWithAPlan();
    aDraftTrip();
    aDraftTrip();

    expect(metrics.read({}).trips).toEqual({ total: 5, draft: 2, planned: 3 });
  });

  // @covers REQ-TRV-069@v1
  test('do not count a Trip its owner has deleted', () => {
    const { metrics, aTripWithAPlan, trips } = aMetricsSetup();
    aTripWithAPlan();
    const gone = aTripWithAPlan();
    trips.softDelete(gone.ownerId, gone.tripId);

    expect(metrics.read({}).trips.total).toBe(1);
  });

  // @covers REQ-TRV-069@v1
  test('show feedback volume 4 with an average rating of 4.0 for feedback rated 5, 4, 3 and 4', () => {
    const { metrics, giveFeedback } = aMetricsSetup();
    for (const rating of [5, 4, 3, 4]) giveFeedback({ rating });

    expect(metrics.read({}).feedback).toEqual({ count: 4, averageRating: 4 });
  });

  // @covers REQ-TRV-069@v1
  test('round the average rating to one decimal', () => {
    const { metrics, giveFeedback } = aMetricsSetup();
    for (const rating of [5, 4, 4]) giveFeedback({ rating });

    expect(metrics.read({}).feedback.averageRating).toBe(4.3);
  });

  // @covers REQ-TRV-069@v1
  test('show generated itineraries 3 for a Plan generated once and regenerated twice, then changed by a chat change and a restore', () => {
    const { metrics, db } = aMetricsSetup();
    const when = TODAY;
    for (let made = 0; made < 3; made += 1) anAiRequestRecord(db, { kind: 'plan-generation', createdAt: when });
    anAiRequestRecord(db, { kind: 'chat', createdAt: when });

    expect(metrics.read({}).generatedItineraries).toBe(3);
  });

  // @covers REQ-TRV-069@v1
  test('do not count a generation that failed, or the regeneration of a single Day', () => {
    const { metrics, db } = aMetricsSetup();
    anAiRequestRecord(db, { kind: 'plan-generation', createdAt: TODAY });
    anAiRequestRecord(db, { kind: 'plan-generation', status: 'failed', createdAt: TODAY });
    anAiRequestRecord(db, { kind: 'day-regeneration', createdAt: TODAY });
    anAiRequestRecord(db, { kind: 'activity-suggestion', createdAt: TODAY });

    expect(metrics.read({}).generatedItineraries).toBe(1);
  });

  // @covers REQ-TRV-069@v1
  test('list 10 Destinations, ordered by number of Trips, for Trips to 12 different Destinations', () => {
    const { metrics, aTripWithAPlan } = aMetricsSetup();
    for (let n = 1; n <= 12; n += 1) {
      for (let trips = 0; trips < n; trips += 1) aTripWithAPlan({ destination: `Place ${String(n).padStart(2, '0')}` });
    }

    const { popularDestinations } = metrics.read({});

    expect(popularDestinations).toHaveLength(10);
    expect(popularDestinations.map((destination) => destination.trips)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(popularDestinations[0]).toMatchObject({ name: 'Place 12', country: 'Japan', trips: 12 });
  });

  // @covers REQ-TRV-069@v1
  test('put Destinations with as many Trips in a fixed order, by name', () => {
    const { metrics, aTripWithAPlan } = aMetricsSetup();
    aTripWithAPlan({ destination: 'Osaka' });
    aTripWithAPlan({ destination: 'Kyoto' });
    aTripWithAPlan({ destination: 'Nara' });

    expect(metrics.read({}).popularDestinations.map((destination) => destination.name)).toEqual(['Kyoto', 'Nara', 'Osaka']);
  });

  // @covers REQ-TRV-069@v1
  test('show average budget 5000 USD and 3000 AUD, and no combined figure, for budgets of 4000 USD, 6000 USD and 3000 AUD', () => {
    const { metrics, aTripWithAPlan } = aMetricsSetup();
    aTripWithAPlan({ trip: { budget: 4000, currency: 'USD' } });
    aTripWithAPlan({ trip: { budget: 6000, currency: 'USD' } });
    aTripWithAPlan({ trip: { budget: 3000, currency: 'AUD' } });

    expect(metrics.read({}).averageBudget).toEqual([
      { currency: 'AUD', amount: 3000 },
      { currency: 'USD', amount: 5000 },
    ]);
  });

  // @covers REQ-TRV-069@v1
  test('round an average budget to a whole unit of its currency', () => {
    const { metrics, aTripWithAPlan } = aMetricsSetup();
    aTripWithAPlan({ trip: { budget: 1000, currency: 'EUR' } });
    aTripWithAPlan({ trip: { budget: 1001, currency: 'EUR' } });

    expect(metrics.read({}).averageBudget).toEqual([{ currency: 'EUR', amount: 1001 }]);
  });

  // @covers REQ-TRV-069@v1
  test('show AI usage of 10 requests and an estimated cost of 1.50 for the date range that holds 10 requests costing 1.50, and not the 5 outside it', () => {
    const { metrics, db } = aMetricsSetup();
    for (let made = 0; made < 10; made += 1) anAiRequestRecord(db, { createdAt: at('2026-10-05'), costMicroUsd: 150_000 });
    for (let made = 0; made < 5; made += 1) anAiRequestRecord(db, { createdAt: at('2026-11-20'), costMicroUsd: 999_000 });

    expect(metrics.read({ from: '2026-10-01', to: '2026-10-31' }).aiUsage).toEqual({ requests: 10, estimatedCost: 1.5, from: '2026-10-01', to: '2026-10-31' });
  });

  // @covers REQ-TRV-069@v1
  test('include both end dates of the range in AI usage', () => {
    const { metrics, db } = aMetricsSetup();
    anAiRequestRecord(db, { createdAt: new Date('2026-10-01T00:00:00.000Z') });
    anAiRequestRecord(db, { createdAt: new Date('2026-10-31T23:59:59.999Z') });
    anAiRequestRecord(db, { createdAt: new Date('2026-11-01T00:00:00.000Z') });
    anAiRequestRecord(db, { createdAt: new Date('2026-09-30T23:59:59.999Z') });

    expect(metrics.read({ from: '2026-10-01', to: '2026-10-31' }).aiUsage.requests).toBe(2);
  });

  // @covers REQ-TRV-069@v1
  test('count every AI request, whatever its outcome or kind, when no range is chosen', () => {
    const { metrics, db } = aMetricsSetup();
    anAiRequestRecord(db, { kind: 'plan-generation', createdAt: new Date(TODAY.getTime() - 400 * DAY) });
    anAiRequestRecord(db, { kind: 'chat', status: 'failed', createdAt: TODAY });

    expect(metrics.read({}).aiUsage).toMatchObject({ requests: 2, from: null, to: null });
  });

  // @covers REQ-TRV-069@v1
  test('do not limit anything but AI usage by the date range', () => {
    const { metrics, giveFeedback, aTripWithAPlan } = aMetricsSetup();
    giveFeedback({ rating: 5, on: '2026-10-05' });
    aTripWithAPlan();

    const ranged = metrics.read({ from: '2027-01-01', to: '2027-01-31' });

    expect(ranged.feedback.count).toBe(1);
    expect(ranged.trips.total).toBe(2);
  });

  // @covers REQ-TRV-069@v1
  test('show every figure as zero, and no average, for an application with nothing in it', () => {
    const { metrics } = aMetricsSetup();

    expect(metrics.read({})).toEqual({
      users: 0,
      trips: { total: 0, draft: 0, planned: 0 },
      generatedItineraries: 0,
      popularDestinations: [],
      averageBudget: [],
      feedback: { count: 0, averageRating: null },
      aiUsage: { requests: 0, estimatedCost: 0, from: null, to: null },
    });
  });
});

describe('the rounding of the usage figures', () => {
  // @covers REQ-TRV-069@v1
  test.each([
    [1_005_000, 1.01],
    [1_015_000, 1.02],
    [1_004_999, 1],
    [149_999, 0.15],
    [4_000, 0],
  ])('rounds an estimated cost of %i micro-dollars to %f dollars, half a cent upwards', (micro, dollars) => {
    const { metrics, db } = aMetricsSetup();
    anAiRequestRecord(db, { createdAt: TODAY, costMicroUsd: micro });

    expect(metrics.read({}).aiUsage.estimatedCost).toBe(dollars);
  });

  // @covers REQ-TRV-069@v1
  test('rounds an average budget of 1000.4 down and of 1000.5 up', () => {
    const { metrics, aTripWithAPlan } = aMetricsSetup();
    for (const budget of [1000, 1000, 1001, 1001, 1000]) aTripWithAPlan({ trip: { budget, currency: 'GBP' } });
    aTripWithAPlan({ trip: { budget: 1000, currency: 'JPY' } });
    aTripWithAPlan({ trip: { budget: 1001, currency: 'JPY' } });

    const figures = metrics.read({}).averageBudget;

    expect(figures.find((figure) => figure.currency === 'GBP')?.amount).toBe(1000);
    expect(figures.find((figure) => figure.currency === 'JPY')?.amount).toBe(1001);
  });
});
