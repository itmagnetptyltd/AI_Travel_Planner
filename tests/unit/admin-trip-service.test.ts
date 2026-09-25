import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { auditLog } from '../../src/server/db/schema';
import { createAdminTripService } from '../../src/server/admin/admin-trip-service';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { aFeedbackSetup } from '../support/a-feedback-setup';

const ADMINISTRATOR = 'an-administrator-id';

function anAdminTripSetup() {
  const setup = aFeedbackSetup();
  const adminTrips = createAdminTripService({ db: setup.db, clock: setup.clock, store: setup.store });
  return { ...setup, adminTrips };
}

describe('the Administrator seeing every Traveler\'s Trips', () => {
  // @covers REQ-TRV-070@v1
  test('lists both Trips, each with its owner, when Travelers X and Y each own one', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    const x = aTripWithAPlan({ name: 'X trip' });
    const y = aTripWithAPlan({ name: 'Y trip' });

    const list = adminTrips.list();

    expect(list.map((trip) => trip.name).sort()).toEqual(['X trip', 'Y trip']);
    expect(list.find((trip) => trip.id === x.tripId)?.owner.email).toBe(`${x.ownerId}@example.com`);
    expect(list.find((trip) => trip.id === y.tripId)?.owner.email).toBe(`${y.ownerId}@example.com`);
  });

  // @covers REQ-TRV-070@v1
  test('lists a Trip with its Destination, dates, number of travelers, budget, status and feedback, and no Days or Activities', () => {
    const { adminTrips, aTripWithAPlan, feedback } = anAdminTripSetup();
    const { tripId, ownerId } = aTripWithAPlan({ destination: 'Tokyo' });
    feedback.save(ownerId, tripId, { rating: 4, comment: 'Day 2 too busy' });

    const [trip] = adminTrips.list();

    expect(trip).toMatchObject({
      destination: { name: 'Tokyo', country: 'Japan' },
      startDate: '2026-10-10',
      endDate: '2026-10-17',
      numberOfTravelers: 4,
      budget: 5000,
      currency: 'USD',
      status: 'Planned',
      feedback: { rating: 4, comment: 'Day 2 too busy' },
    });
    expect(JSON.stringify(trip)).not.toMatch(/"days"|"activities"|"plan"/);
  });

  // @covers REQ-TRV-070@v1
  test('lists a Trip with no feedback as having none', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    aTripWithAPlan();

    expect(adminTrips.list()[0]?.feedback).toBeNull();
  });

  // @covers REQ-TRV-070@v1
  test('does not list a Trip its owner has deleted', () => {
    const { adminTrips, aTripWithAPlan, trips } = anAdminTripSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    trips.softDelete(ownerId, tripId);

    expect(adminTrips.list()).toEqual([]);
    expect(adminTrips.get(tripId)).toBeNull();
  });

  // @covers REQ-TRV-070@v1
  test('refuses the full Plan of a Trip that has a Plan and no feedback, and writes no audit entry', () => {
    const { adminTrips, aTripWithAPlan, db } = anAdminTripSetup();
    const { tripId } = aTripWithAPlan();

    expect(adminTrips.planFor(ADMINISTRATOR, tripId)).toEqual({ ok: false, error: 'no-feedback' });
    expect(db.select().from(auditLog).all()).toEqual([]);
  });

  // @covers REQ-TRV-070@v1
  test('shows the full Plan of a Trip that has feedback, and records the Administrator and the Trip in the audit log', () => {
    const { adminTrips, aTripWithAPlan, feedback, db } = anAdminTripSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    feedback.save(ownerId, tripId, { rating: 2, comment: 'Too busy' });

    const result = adminTrips.planFor(ADMINISTRATOR, tripId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.plan.days).toHaveLength(8);
    expect(result.view.notice).toBe(PLAN_RECOMMENDATION_NOTICE);
    const entries = db.select().from(auditLog).where(eq(auditLog.subjectId, tripId)).all();
    expect(entries).toMatchObject([{ actorAccountId: ADMINISTRATOR, action: 'trip-plan.viewed', subjectType: 'trip', subjectId: tripId }]);
  });

  // @covers REQ-TRV-070@v1
  test('records every view, so opening a Plan twice leaves two entries', () => {
    const { adminTrips, aTripWithAPlan, feedback, db } = anAdminTripSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    feedback.save(ownerId, tripId, { rating: 2, comment: null });

    adminTrips.planFor(ADMINISTRATOR, tripId);
    adminTrips.planFor(ADMINISTRATOR, tripId);

    expect(db.select().from(auditLog).all()).toHaveLength(2);
  });

  // @covers REQ-TRV-070@v1
  test('returns no Plan when the audit entry cannot be written', () => {
    const { db, clock, store, aTripWithAPlan, feedback } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    feedback.save(ownerId, tripId, { rating: 2, comment: null });
    const failing = createAdminTripService({
      db,
      clock,
      store,
      audit: () => {
        throw new Error('The audit log is unavailable.');
      },
    });

    expect(() => failing.planFor(ADMINISTRATOR, tripId)).toThrow('The audit log is unavailable.');
  });

  // @covers REQ-TRV-070@v1
  test('shows a Plan with no ids, no owner and no account email, so it identifies nobody', () => {
    const { adminTrips, aTripWithAPlan, feedback } = anAdminTripSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    feedback.save(ownerId, tripId, { rating: 2, comment: null });
    const result = adminTrips.planFor(ADMINISTRATOR, tripId);

    const text = JSON.stringify(result);

    for (const secret of [tripId, ownerId, `${ownerId}@example.com`]) expect(text).not.toContain(secret);
  });

  // @covers REQ-TRV-070@v1
  test('says a Trip that does not exist is not found, and writes no audit entry', () => {
    const { adminTrips, db } = anAdminTripSetup();

    expect(adminTrips.planFor(ADMINISTRATOR, 'no-such-trip')).toEqual({ ok: false, error: 'not-found' });
    expect(db.select().from(auditLog).all()).toEqual([]);
  });
});

describe('the Administrator seeing a Trip\'s summary and not its Plan', () => {
  // @covers REQ-TRV-101@v1
  test('carries Destination, dates, number of travelers, budget and status, and no Days or Activities', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    const { tripId } = aTripWithAPlan({ destination: 'Tokyo' });

    const summary = adminTrips.get(tripId);

    expect(summary).toMatchObject({
      destination: { name: 'Tokyo' },
      startDate: '2026-10-10',
      endDate: '2026-10-17',
      numberOfTravelers: 4,
      budget: 5000,
      status: 'Planned',
    });
    expect(Object.keys(summary ?? {})).not.toEqual(expect.arrayContaining(['days']));
    expect(JSON.stringify(summary)).not.toMatch(/"days"|"activities"|"plan"/);
  });

  // @covers REQ-TRV-101@v1
  test('is the same summary the list gives for that Trip', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    const { tripId } = aTripWithAPlan();

    expect(adminTrips.get(tripId)).toEqual(adminTrips.list()[0]);
  });
});

describe('what the Administrator is told about an owner', () => {
  // @covers REQ-TRV-070@v1
  test('is the owner\'s email address and nothing else that names the account: no account identifier', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    const { ownerId } = aTripWithAPlan();

    const [trip] = adminTrips.list();

    expect(Object.keys(trip?.owner ?? {})).toEqual(['email']);
    expect(JSON.stringify(trip)).not.toContain(ownerId.replace('@example.com', '') + '"');
  });

  // @covers REQ-TRV-101@v1
  test('is the summary of the Trip asked for, not of another, when there are several', () => {
    const { adminTrips, aTripWithAPlan } = anAdminTripSetup();
    aTripWithAPlan({ name: 'First trip', destination: 'Kyoto' });
    const second = aTripWithAPlan({ name: 'Second trip', destination: 'Osaka' });
    aTripWithAPlan({ name: 'Third trip', destination: 'Nara' });

    expect(adminTrips.get(second.tripId)).toMatchObject({ name: 'Second trip', destination: { name: 'Osaka' } });
  });
});
