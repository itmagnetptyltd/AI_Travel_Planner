import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import type { TripView } from '../../src/shared/trip-schemas';
import {
  aDayReplyText,
  activityAt,
  anActivityReplyText,
  aTravelerWithAPlan,
  editActivityOf,
  planOf,
  regenerateDayOf,
  regeneratePlanOf,
  replaceActivityOf,
  suggestionFor,
  titlesOnDay,
} from '../support/a-plan-edits';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { accountIdOfTraveler, aTravelerWithATrip, restoreVersion, versionsOf } from '../support/a-saved-plan-journey';
import { aConfirmedTravelerSession, anAdministratorSession, TODAY } from '../support/a-trip';
import { generationsAlreadyMade } from '../support/an-ai-request';

const A_FRESH_DAY = aDayReplyText(4, [
  { title: 'Fresh breakfast', startTime: '08:30' },
  { title: 'Fresh gardens', startTime: '14:00' },
]);

const aBrandNewPlan = (title = 'Brand new idea') =>
  aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title })] })) });

const oneMinuteBeforeNow = () => new Date(TODAY.getTime() - 60_000);

async function aTravelerWithAHandEdit() {
  const ready = await aTravelerWithAPlan();
  const edited = await editActivityOf(ready, activityAt(ready.plan, 4, 0).id, { startTime: '11:11' });
  return { ready, edited: edited.json() as SavedPlan };
}

describe('regenerating the whole Plan', () => {
  // @covers REQ-TRV-041@v1
  test('answers 201 with the Plan the AI wrote, and keeps the earlier Plan as a version that can be restored', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.replyWith(aBrandNewPlan());

    const response = await regeneratePlanOf(ready);

    expect(response.statusCode).toBe(201);
    expect((response.json() as SavedPlan).days[0]?.activities[0]?.title).toBe('Brand new idea');
    expect((await versionsOf(ready)).map((v) => v.version)).toEqual([2, 1]);
    await restoreVersion(ready, 1);
    expect((await planOf(ready)).days).toEqual(ready.plan.days);
  });

  // @covers REQ-TRV-041@v1
  test('answers 409 EDITS_WOULD_BE_REPLACED, naming the Days, and sends nothing to the AI, when an Activity was changed by hand', async () => {
    const { ready, edited } = await aTravelerWithAHandEdit();
    const asked = ready.testApp.ai.requests.length;

    const response = await regeneratePlanOf(ready);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'EDITS_WOULD_BE_REPLACED', days: [4] });
    expect(ready.testApp.ai.requests).toHaveLength(asked);
    expect(await planOf(ready)).toEqual(edited);
  });

  // @covers REQ-TRV-041@v1
  test('answers 201 once the Traveler confirms, and the hand-changed Activity is gone from the Plan', async () => {
    const { ready } = await aTravelerWithAHandEdit();
    ready.testApp.ai.replyWith(aBrandNewPlan());

    const response = await regeneratePlanOf(ready, { confirmReplaceEdits: true });

    expect(response.statusCode).toBe(201);
    const plan = response.json() as SavedPlan;
    expect(plan.days.flatMap((day) => day.activities).some((a) => a.changedByHand)).toBe(false);
    expect(titlesOnDay(plan, 4)).toEqual(['Brand new idea']);
  });

  // @covers REQ-TRV-041@v1
  test('needs no confirmation, and none is asked for, when nothing was changed by hand', async () => {
    const ready = await aTravelerWithAPlan();

    expect((await regeneratePlanOf(ready)).statusCode).toBe(201);
    expect((await regeneratePlanOf(ready, { confirmReplaceEdits: true })).statusCode).toBe(201);
  });

  // @covers REQ-TRV-041@v1
  test('answers 429 with the reset time at the daily limit, and the saved Plan is unchanged', async () => {
    const ready = await aTravelerWithAPlan();
    generationsAlreadyMade(ready.testApp.db, accountIdOfTraveler(ready.testApp), 19, oneMinuteBeforeNow());
    const asked = ready.testApp.ai.requests.length;

    const response = await regeneratePlanOf(ready);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', limit: 20, resetsAt: '2026-09-24T00:00:00.000Z' });
    expect(ready.testApp.ai.requests).toHaveLength(asked);
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-102@v1
  test('answers 503 with the unavailable message when the AI fails, and the earlier Plan is still the current one', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.failWith();

    const response = await regeneratePlanOf(ready);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(await planOf(ready)).toEqual(ready.plan);
    expect(await versionsOf(ready)).toHaveLength(1);
  });

  // @covers REQ-TRV-043@v1
  test('sends the Trip current travel style and interests, and the Trip keeps them afterwards', async () => {
    const ready = await aTravelerWithAPlan({ trip: { travelStyles: ['Adventure'], interests: ['Nature'] } });

    await regeneratePlanOf(ready);

    const text = requestTextOf(ready.testApp.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Adventure');
    expect(text).toContain('Interests: Nature');
    const trip = (await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView;
    expect(trip).toMatchObject({ travelStyles: ['Adventure'], interests: ['Nature'] });
  });

  // @covers REQ-TRV-094@v1
  test('regenerates the Plan of a Trip whose Destination an Administrator disabled, and the Trip still shows it', async () => {
    const ready = await aTravelerWithAPlan();
    const destinationId = ((await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView).destination.id;
    const disabled = await ready.testApp.app.inject({
      method: 'POST',
      url: `/api/admin/destinations/${destinationId}/disable`,
      cookies: await anAdministratorSession(ready.testApp),
    });
    expect(disabled.statusCode).toBe(200);
    ready.testApp.ai.replyWith(aBrandNewPlan());

    const response = await regeneratePlanOf(ready);

    expect(response.statusCode).toBe(201);
    expect(titlesOnDay(response.json() as SavedPlan, 1)).toEqual(['Brand new idea']);
    const trip = (await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView;
    expect(trip.destination).toMatchObject({ id: destinationId, name: 'Kyoto' });
  });

  test('answers 400 naming the field when the confirmation is not true or false', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await regeneratePlanOf(ready, { confirmReplaceEdits: 'yes' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'confirmReplaceEdits' });
  });
});

describe('regenerating one Day', () => {
  // @covers REQ-TRV-042@v1
  test('answers 201 with Day 4 replaced and the other 7 Days identical to before', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.replyWith(A_FRESH_DAY);

    const response = await regenerateDayOf(ready, 4);

    expect(response.statusCode).toBe(201);
    const plan = response.json() as SavedPlan;
    expect(titlesOnDay(plan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
    expect(plan.days.filter((day) => day.dayNumber !== 4)).toEqual(ready.plan.days.filter((day) => day.dayNumber !== 4));
    expect((await versionsOf(ready)).map((v) => [v.version, v.source])).toEqual([[2, 'day-regeneration'], [1, 'generation']]);
  });

  // @covers REQ-TRV-042@v1
  test('answers 409 EDITS_WOULD_BE_REPLACED for Day 4, sending nothing to the AI, when Day 4 holds a hand-changed Activity', async () => {
    const { ready } = await aTravelerWithAHandEdit();
    const asked = ready.testApp.ai.requests.length;

    const response = await regenerateDayOf(ready, 4);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'EDITS_WOULD_BE_REPLACED', days: [4] });
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-042@v1
  test('replaces Day 4 hand edits when confirmed, and leaves the hand edits on Day 5', async () => {
    const { ready } = await aTravelerWithAHandEdit();
    const onDay5 = activityAt(ready.plan, 5, 1);
    await editActivityOf(ready, onDay5.id, { startTime: '13:13' });
    ready.testApp.ai.replyWith(A_FRESH_DAY);

    const response = await regenerateDayOf(ready, 4, { confirmReplaceEdits: true });

    expect(response.statusCode).toBe(201);
    const plan = response.json() as SavedPlan;
    expect(titlesOnDay(plan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
    expect(plan.days[4]?.activities.find((a) => a.id === onDay5.id)).toMatchObject({ startTime: '13:13', changedByHand: true });
  });

  // @covers REQ-TRV-042@v1
  test.each([['a Day the Plan does not have', '12'], ['Day 0', '0'], ['a Day that is not a number', 'four']])(
    'answers 404 DAY_NOT_FOUND for %s, and the AI is not asked',
    async (_name, day) => {
      const ready = await aTravelerWithAPlan();
      const asked = ready.testApp.ai.requests.length;

      const response = await ready.testApp.app.inject({
        method: 'POST',
        url: `/api/trips/${ready.tripId}/plan/days/${day}/regenerate`,
        cookies: ready.cookies,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'DAY_NOT_FOUND' });
      expect(ready.testApp.ai.requests).toHaveLength(asked);
    },
  );

  // @covers REQ-TRV-042@v1
  test('offers no request that regenerates a single Activity', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await ready.testApp.app.inject({
      method: 'POST',
      url: `/api/trips/${ready.tripId}/plan/activities/${activityAt(ready.plan, 1, 0).id}/regenerate`,
      cookies: ready.cookies,
    });

    expect(response.statusCode).toBe(404);
  });

  // @covers REQ-TRV-043@v1
  test('sends the Trip current travel style and interests, and the Trip keeps them afterwards', async () => {
    const ready = await aTravelerWithAPlan({ trip: { travelStyles: ['Adventure'], interests: ['Nature'] } });
    ready.testApp.ai.replyWith(A_FRESH_DAY);

    await regenerateDayOf(ready, 4);

    const text = requestTextOf(ready.testApp.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Adventure');
    expect(text).toContain('Interests: Nature');
    const trip = (await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView;
    expect(trip).toMatchObject({ travelStyles: ['Adventure'], interests: ['Nature'] });
  });

  // @covers REQ-TRV-094@v1
  test('regenerates a Day of a Trip whose Destination an Administrator disabled', async () => {
    const ready = await aTravelerWithAPlan();
    const destinationId = ((await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView).destination.id;
    await ready.testApp.app.inject({
      method: 'POST',
      url: `/api/admin/destinations/${destinationId}/disable`,
      cookies: await anAdministratorSession(ready.testApp),
    });
    ready.testApp.ai.replyWith(A_FRESH_DAY);

    const response = await regenerateDayOf(ready, 4);

    expect(response.statusCode).toBe(201);
    expect(titlesOnDay(response.json() as SavedPlan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
  });

  // @covers REQ-TRV-102@v1
  test('answers 503 when the AI fails, and the saved Plan is still the current one', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.failWith();

    const response = await regenerateDayOf(ready, 4);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-041@v1
  test('answers 429 with the reset time at the daily limit, and the saved Plan is unchanged', async () => {
    const ready = await aTravelerWithAPlan();
    generationsAlreadyMade(ready.testApp.db, accountIdOfTraveler(ready.testApp), 19, oneMinuteBeforeNow());

    const response = await regenerateDayOf(ready, 4);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', resetsAt: '2026-09-24T00:00:00.000Z' });
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  test('answers 404 to another Traveler, and 404 PLAN_NOT_FOUND for a Trip with no Plan', async () => {
    const ready = await aTravelerWithAPlan();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');
    const noPlan = await aTravelerWithATrip();

    expect((await regenerateDayOf(ready, 4, undefined, other)).json()).toEqual({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
    expect((await regenerateDayOf(noPlan, 1)).json()).toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  test('answers 401 to a caller who is not logged in', async () => {
    const ready = await aTravelerWithAPlan();

    expect((await regenerateDayOf(ready, 4, undefined, {})).statusCode).toBe(401);
  });
});

describe('asking the AI for a replacement Activity', () => {
  // @covers REQ-TRV-047@v1
  test('answers 200 with the Activity the AI suggests, and the saved Plan is unchanged', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.replyWith(anActivityReplyText({ title: 'Tea ceremony', startTime: '12:30', estimatedCost: 30 }));

    const response = await suggestionFor(ready, activityAt(ready.plan, 2, 1).id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ title: 'Tea ceremony', startTime: '12:30', estimatedCost: 30 });
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-047@v1
  test('puts the suggested Activity where the replaced one was once the Traveler accepts it', async () => {
    const ready = await aTravelerWithAPlan();
    const lunch = activityAt(ready.plan, 2, 1);
    ready.testApp.ai.replyWith(anActivityReplyText({ title: 'Tea ceremony', startTime: '12:30' }));
    const suggestion = (await suggestionFor(ready, lunch.id)).json() as object;

    const accepted = await replaceActivityOf(ready, lunch.id, { ...suggestion, fromSuggestion: true });

    expect(accepted.statusCode).toBe(200);
    const plan = await planOf(ready);
    expect(titlesOnDay(plan, 2)).toEqual(['Visit Senso-ji Temple', 'Tea ceremony', 'Evening walk']);
    expect(plan.days[1]?.activities[1]?.changedByHand).toBe(false);
  });

  // @covers REQ-TRV-047@v1
  test('answers 429 with the reset time at the daily limit, and the AI is not asked', async () => {
    const ready = await aTravelerWithAPlan();
    generationsAlreadyMade(ready.testApp.db, accountIdOfTraveler(ready.testApp), 19, oneMinuteBeforeNow());
    const asked = ready.testApp.ai.requests.length;

    const response = await suggestionFor(ready, activityAt(ready.plan, 2, 1).id);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', limit: 20, resetsAt: '2026-09-24T00:00:00.000Z' });
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-047@v1
  test('answers 503 when the AI fails, and 404 ACTIVITY_NOT_FOUND for an Activity that is not in the Plan', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.failWith();

    expect((await suggestionFor(ready, activityAt(ready.plan, 2, 1).id)).statusCode).toBe(503);
    expect((await suggestionFor(ready, 'nope')).json()).toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });

  test('answers 404 to another Traveler, and 401 to a caller who is not logged in', async () => {
    const ready = await aTravelerWithAPlan();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    expect((await suggestionFor(ready, activityAt(ready.plan, 2, 1).id, other)).json()).toEqual({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
    expect((await suggestionFor(ready, activityAt(ready.plan, 2, 1).id, {})).statusCode).toBe(401);
  });
});
