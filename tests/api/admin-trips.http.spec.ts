import { describe, expect, test } from 'vitest';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import type { AdminPlanView, AdminTripSummary } from '../../src/shared/admin-trips';
import { anAdminScenario } from '../support/an-admin-scenario';
import { aLoggedInTraveler } from '../support/a-traveler';
import { eq } from 'drizzle-orm';
import { auditLog } from '../../src/server/db/schema';

const tripsOf = (response: { json(): unknown }) => (response.json() as { trips: AdminTripSummary[] }).trips;

describe('the Administrator seeing every Traveler\'s Trips through the API', () => {
  // @covers REQ-TRV-070@v1
  test('lists both Trips, each with its owner, when Travelers X and Y each own one', async () => {
    const scenario = await anAdminScenario();
    await scenario.aTraveler('x@example.com', { tripName: 'X trip' });
    await scenario.aTraveler('y@example.com', { tripName: 'Y trip' });

    const response = await scenario.asAdmin('GET', '/api/admin/trips');

    expect(response.statusCode).toBe(200);
    expect(tripsOf(response).map((trip) => [trip.name, trip.owner.email]).sort()).toEqual([
      ['X trip', 'x@example.com'],
      ['Y trip', 'y@example.com'],
    ]);
  });

  // @covers REQ-TRV-070@v1
  test('lists a Trip with its Destination, dates, number of travelers, budget, status and feedback, and no Days or Activities', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');
    await scenario.feedbackFrom(traveler, { rating: 4, comment: 'Day 2 too busy' });

    const response = await scenario.asAdmin('GET', '/api/admin/trips');

    expect(tripsOf(response)).toMatchObject([
      {
        destination: { name: 'Tokyo' },
        startDate: '2026-10-10',
        endDate: '2026-10-17',
        numberOfTravelers: 4,
        budget: 5000,
        status: 'Planned',
        feedback: { rating: 4, comment: 'Day 2 too busy' },
      },
    ]);
    expect(response.body).not.toMatch(/"days"|"activities"|"plan"/);
  });

  // @covers REQ-TRV-070@v1
  test('refuses the full Plan of a Trip with a Plan and no feedback with 403, and shows no Days or Activities', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');

    const refused = await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}/plan`);

    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'PLAN_NOT_AVAILABLE' });
    expect(refused.body).not.toMatch(/"days"|"activities"|Morning|Lunch/i);
    expect(scenario.testApp.db.select().from(auditLog).where(eq(auditLog.action, 'trip-plan.viewed')).all()).toEqual([]);
  });

  // @covers REQ-TRV-070@v1
  test('shows the full Plan of a Trip with feedback, and records the Administrator and the Trip in the audit log', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');
    await scenario.feedbackFrom(traveler, { rating: 2, comment: 'Too busy' });

    const opened = await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}/plan`);

    expect(opened.statusCode).toBe(200);
    const view = opened.json() as AdminPlanView;
    expect(view.plan.days).toHaveLength(8);
    expect(view.notice).toBe(PLAN_RECOMMENDATION_NOTICE);
    const entries = scenario.testApp.db.select().from(auditLog).where(eq(auditLog.action, 'trip-plan.viewed')).all();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ subjectType: 'trip', subjectId: traveler.tripId });
    expect(entries[0]?.actorAccountId).toBeTruthy();
  });

  // @covers REQ-TRV-070@v1
  test('shows a Plan that identifies no one: no identifier and no email address', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');
    await scenario.feedbackFrom(traveler, { rating: 2 });

    const opened = await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}/plan`);

    expect(opened.body).not.toContain(traveler.tripId);
    expect(opened.body).not.toContain('x@example.com');
  });

  // @covers REQ-TRV-070@v1
  test('answers 404 for a Trip that does not exist, or that its owner has deleted', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');
    await scenario.feedbackFrom(traveler, { rating: 2 });
    await scenario.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${traveler.tripId}`, cookies: traveler.cookies });

    expect((await scenario.asAdmin('GET', '/api/admin/trips/no-such-trip/plan')).statusCode).toBe(404);
    expect((await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}/plan`)).statusCode).toBe(404);
    expect((await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}`)).statusCode).toBe(404);
    expect(tripsOf(await scenario.asAdmin('GET', '/api/admin/trips'))).toEqual([]);
  });

  // @covers REQ-TRV-070@v1
  test('answers 403 to a Traveler, and 401 to someone not logged in, on every Trips route', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');
    const { cookies } = await aLoggedInTraveler(scenario.testApp.app, { email: 'nosy@example.com' });

    for (const url of ['/api/admin/trips', `/api/admin/trips/${traveler.tripId}`, `/api/admin/trips/${traveler.tripId}/plan`]) {
      expect((await scenario.testApp.app.inject({ method: 'GET', url, cookies })).statusCode).toBe(403);
      expect((await scenario.testApp.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });
});

describe('the Administrator seeing a Trip\'s summary and not its Plan, through the API', () => {
  // @covers REQ-TRV-101@v1
  test('carries Destination, dates, number of travelers, budget and status, and no Days or Activities', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');

    const response = await scenario.asAdmin('GET', `/api/admin/trips/${traveler.tripId}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      destination: { name: 'Tokyo' },
      startDate: '2026-10-10',
      endDate: '2026-10-17',
      numberOfTravelers: 4,
      budget: 5000,
      status: 'Planned',
    });
    expect(response.body).not.toMatch(/"days"|"activities"|"plan"/);
  });

  // @covers REQ-TRV-101@v1
  test('is not what the Traveler\'s own Trip route gives an Administrator: that Trip is still the owner\'s alone', async () => {
    const scenario = await anAdminScenario();
    const traveler = await scenario.aTraveler('x@example.com');

    const asOwnerRoute = await scenario.asAdmin('GET', `/api/trips/${traveler.tripId}`);
    const plan = await scenario.asAdmin('GET', `/api/trips/${traveler.tripId}/plan`);

    expect(asOwnerRoute.statusCode).toBe(404);
    expect(plan.statusCode).toBe(404);
  });
});
