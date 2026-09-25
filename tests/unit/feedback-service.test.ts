import { describe, expect, test } from 'vitest';
import { feedback as feedbackTable } from '../../src/server/db/schema';
import { DAY } from '../support/a-day';
import { aFeedbackSetup } from '../support/a-feedback-setup';

describe('giving feedback on a Trip', () => {
  // @covers REQ-TRV-062@v1
  test('accepts rating 4 and "Day 2 too busy" on a Trip that has a Plan', () => {
    const { feedback, aTripWithAPlan } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();

    const result = feedback.save(ownerId, tripId, { rating: 4, comment: 'Day 2 too busy' });

    expect(result).toMatchObject({ ok: true, feedback: { rating: 4, comment: 'Day 2 too busy' } });
  });

  // @covers REQ-TRV-062@v1
  test('refuses a Draft Trip that has no Plan, and stores none', () => {
    const { feedback, aDraftTrip, db } = aFeedbackSetup();
    const { tripId, ownerId } = aDraftTrip();

    const result = feedback.save(ownerId, tripId, { rating: 4, comment: null });

    expect(result).toEqual({ ok: false, error: 'no-plan' });
    expect(db.select().from(feedbackTable).all()).toEqual([]);
  });

  // @covers REQ-TRV-062@v1
  test('leaves one entry, rated 5, when the Trip had rating 2 and its owner submits rating 5', () => {
    const { feedback, aTripWithAPlan, db } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    feedback.save(ownerId, tripId, { rating: 2, comment: 'Too busy' });

    feedback.save(ownerId, tripId, { rating: 5, comment: null });

    expect(db.select().from(feedbackTable).all()).toHaveLength(1);
    expect(feedback.forTrip(ownerId, tripId)).toMatchObject({ ok: true, feedback: { rating: 5, comment: null } });
  });

  // @covers REQ-TRV-062@v1
  test('records the Plan version current when it was saved: 3 when the Plan is at version 3', () => {
    const { feedback, aTripWithAPlan, regenerate } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    regenerate(tripId);
    regenerate(tripId);

    const result = feedback.save(ownerId, tripId, { rating: 3, comment: null });

    expect(result).toMatchObject({ ok: true, feedback: { planVersion: 3 } });
  });

  // @covers REQ-TRV-062@v1
  test('is accepted after the Trip has ended, since a Plan is all it needs', () => {
    const { feedback, aTripWithAPlan, clock } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    clock.advanceBy(60 * DAY);

    expect(feedback.save(ownerId, tripId, { rating: 4, comment: 'Lovely' }).ok).toBe(true);
  });

  // @covers REQ-TRV-062@v1
  test('cannot be given on a Trip that is not the caller\'s, or that does not exist', () => {
    const { feedback, aTripWithAPlan, aTraveler } = aFeedbackSetup();
    const { tripId } = aTripWithAPlan();

    expect(feedback.save(aTraveler(), tripId, { rating: 4, comment: null })).toEqual({ ok: false, error: 'not-found' });
    expect(feedback.save(aTraveler(), 'no-such-trip', { rating: 4, comment: null })).toEqual({ ok: false, error: 'not-found' });
  });

  // @covers REQ-TRV-062@v1
  test('cannot be given on a Trip that has been deleted', () => {
    const { feedback, aTripWithAPlan, trips } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    trips.softDelete(ownerId, tripId);

    expect(feedback.save(ownerId, tripId, { rating: 4, comment: null })).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('what a piece of feedback is stored against', () => {
  // @covers REQ-TRV-063@v1
  test('is the Trip it was given on, identified by its name: "Tokyo Family Holiday"', () => {
    const { feedback, aTripWithAPlan } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan({ name: 'Tokyo Family Holiday' });
    feedback.save(ownerId, tripId, { rating: 4, comment: null });

    expect(feedback.forTrip(ownerId, tripId)).toMatchObject({ ok: true, feedback: { trip: { id: tripId, name: 'Tokyo Family Holiday' } } });
  });

  // @covers REQ-TRV-063@v1
  test('identifies Plan version 2 when it was given at version 2, though the Plan is later regenerated to version 3', () => {
    const { feedback, aTripWithAPlan, regenerate } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    regenerate(tripId);
    feedback.save(ownerId, tripId, { rating: 4, comment: null });

    regenerate(tripId);

    expect(feedback.forTrip(ownerId, tripId)).toMatchObject({ ok: true, feedback: { planVersion: 2 } });
  });

  // @covers REQ-TRV-063@v1
  test('says version 3 once the Traveler edits it after the Plan was regenerated to version 3', () => {
    const { feedback, aTripWithAPlan, regenerate } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();
    regenerate(tripId);
    feedback.save(ownerId, tripId, { rating: 4, comment: null });
    regenerate(tripId);

    feedback.save(ownerId, tripId, { rating: 5, comment: 'Better now' });

    expect(feedback.forTrip(ownerId, tripId)).toMatchObject({ ok: true, feedback: { planVersion: 3, rating: 5 } });
  });

  // @covers REQ-TRV-063@v1
  test('keeps the Destination as it was when the feedback was saved, whatever happens to the Destination later', () => {
    const { feedback, aTripWithAPlan, destinations } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan({ destination: 'Tokyo' });
    feedback.save(ownerId, tripId, { rating: 4, comment: null });
    const [tokyo] = destinations.listForAdmin().filter((destination) => destination.name === 'Tokyo');
    destinations.edit(tokyo?.id ?? '', { name: 'Edo' });

    expect(feedback.forTrip(ownerId, tripId)).toMatchObject({ ok: true, feedback: { destination: { name: 'Tokyo', country: 'Japan' } } });
  });

  // @covers REQ-TRV-063@v1
  test('has no account of its own: the row cannot be traced to a Traveler except through its Trip', () => {
    const { db } = aFeedbackSetup();

    expect(Object.keys(feedbackTable)).not.toContain('accountId');
    expect(Object.keys(feedbackTable)).not.toContain('ownerAccountId');
    expect(db.select().from(feedbackTable).all()).toEqual([]);
  });

  // @covers REQ-TRV-063@v1
  test('reads as none for a Trip that has none, and as not found for a Trip that is not the caller\'s', () => {
    const { feedback, aTripWithAPlan, aTraveler } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan();

    expect(feedback.forTrip(ownerId, tripId)).toEqual({ ok: true, feedback: null });
    expect(feedback.forTrip(aTraveler(), tripId)).toEqual({ ok: false, error: 'not-found' });
  });
});
