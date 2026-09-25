import { describe, expect, test } from 'vitest';
import type { TripView } from '../../src/shared/trip-schemas';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { activityAt, aDayReplyText, aTravelerWithAPlan, editActivityOf, regenerateDayOf, regeneratePlanOf } from '../support/a-plan-edits';
import { acceptChange, activitiesOnDay, aChatReplyText, aTravelerWithAShoppingPlan, changeFor, messagesOf, sendChat } from '../support/a-chat';
import { DAY } from '../support/a-day';
import { logIn, sessionCookieFrom } from '../support/a-traveler';
import { aTripInput, anAddedDestination, anAdministratorSession, createdTrip } from '../support/a-trip';
import { aConfirmedTraveler } from '../support/an-administrator';
import { APP_BASE_URL, buildTestApp, EMAIL_FROM } from '../support/build-test-app';
import { MINUTE } from '../support/fixed-clock';

const TRAVELER = 'traveler@example.com';

const emailsWith = (testApp: Awaited<ReturnType<typeof buildTestApp>>, subject: RegExp) =>
  testApp.email.sentTo(TRAVELER).filter((message) => subject.test(message.subject));
const createdEmails = (testApp: Awaited<ReturnType<typeof buildTestApp>>) => emailsWith(testApp, /was created$/);
const updatedEmails = (testApp: Awaited<ReturnType<typeof buildTestApp>>) => emailsWith(testApp, /was updated$/);

/** A confirmed Traveler, logged in, with no Trip yet: so a switch can be set before the Trip is made. */
async function aTravelerWithNoTrip(options: Parameters<typeof buildTestApp>[0] = {}) {
  const testApp = await buildTestApp(options);
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email: TRAVELER });
  const cookies = sessionCookieFrom(await logIn(testApp.app, traveler));
  return { testApp, destinationId, cookies };
}

const switchOff = (ready: Awaited<ReturnType<typeof aTravelerWithNoTrip>>, notifications: object) =>
  ready.testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload: { notifications } });

async function switchOffForEveryone(testApp: Awaited<ReturnType<typeof buildTestApp>>, payload: object) {
  const admin = await anAdministratorSession(testApp);
  const response = await testApp.app.inject({ method: 'PUT', url: '/api/admin/notification-settings', cookies: admin, payload });
  expect(response.statusCode).toBe(200);
}

const patchTrip = (ready: { testApp: Awaited<ReturnType<typeof buildTestApp>>; cookies: Record<string, string>; tripId: string }, payload: object) =>
  ready.testApp.app.inject({ method: 'PATCH', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies, payload });

const tripOf = async (ready: Parameters<typeof patchTrip>[0]): Promise<TripView> =>
  (await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView;

const withTheRestUnchanged = (trip: TripView, change: object) => ({
  name: trip.name,
  destinationId: trip.destination.id,
  startDate: trip.startDate,
  endDate: trip.endDate,
  adults: trip.adults,
  children: trip.children,
  budget: trip.budget,
  currency: trip.currency,
  ...change,
});

describe('the Trip Created email', () => {
  // @covers REQ-TRV-055@v1
  test('is one short email with the Trip name, Destination, dates and a link to open the Trip, from the configured sender, and no Plan', async () => {
    const ready = await aTravelerWithNoTrip();

    const trip = await createdTrip(ready.testApp.app, ready.cookies, aTripInput(ready.destinationId));

    expect(createdEmails(ready.testApp)).toHaveLength(1);
    const [email] = createdEmails(ready.testApp);
    expect(email).toMatchObject({ to: TRAVELER, from: EMAIL_FROM });
    for (const wanted of ['Tokyo Family Holiday', 'Kyoto, Japan', '2026-10-10', '2026-10-17', `${APP_BASE_URL}/trips/${trip.id}`]) expect(email?.text).toContain(wanted);
    expect(email?.text).not.toMatch(/Day \d|estimate/i);
  });

  // @covers REQ-TRV-055@v1
  test('is not sent again when the owner edits and saves the Trip', async () => {
    const ready = await aTravelerWithNoTrip();
    const trip = await createdTrip(ready.testApp.app, ready.cookies, aTripInput(ready.destinationId));

    const saved = await patchTrip({ ...ready, tripId: trip.id }, { name: 'Renamed holiday' });

    expect(saved.statusCode).toBe(200);
    expect(createdEmails(ready.testApp)).toHaveLength(1);
  });

  // @covers REQ-TRV-055@v1
  // @covers REQ-TRV-060@v1
  test('is not sent to a Traveler who has switched it off for their own account', async () => {
    const ready = await aTravelerWithNoTrip();
    expect((await switchOff(ready, { tripCreated: false })).statusCode).toBe(200);

    await createdTrip(ready.testApp.app, ready.cookies, aTripInput(ready.destinationId));

    expect(createdEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-055@v1
  // @covers REQ-TRV-060@v1
  test('is not sent when an Administrator has switched it off for everyone, though the Traveler has it on', async () => {
    const ready = await aTravelerWithNoTrip();
    await switchOffForEveryone(ready.testApp, { tripCreated: false });

    await createdTrip(ready.testApp.app, ready.cookies, aTripInput(ready.destinationId));

    expect(createdEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-055@v1
  test('does not hold the Trip up for ever when the mail service stops answering', async () => {
    const ready = await aTravelerWithNoTrip({ emailTimeoutMs: 100 });
    ready.testApp.email.setHung(true);

    const response = await ready.testApp.app.inject({ method: 'POST', url: '/api/trips', cookies: ready.cookies, payload: aTripInput(ready.destinationId) });

    expect(response.statusCode).toBe(201);
    expect(createdEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-055@v1
  test('does not stop the Trip being created when the mail service is down', async () => {
    const ready = await aTravelerWithNoTrip();
    ready.testApp.email.setDown(true);

    const response = await ready.testApp.app.inject({ method: 'POST', url: '/api/trips', cookies: ready.cookies, payload: aTripInput(ready.destinationId) });

    expect(response.statusCode).toBe(201);
    expect(createdEmails(ready.testApp)).toEqual([]);
  });
});

describe('the Itinerary Updated email', () => {
  // @covers REQ-TRV-056@v1
  test('is sent once, naming the Trip, when the dates of a Trip that has a Plan are changed', async () => {
    const ready = await aTravelerWithAPlan();

    const saved = await patchTrip(ready, withTheRestUnchanged(await tripOf(ready), { startDate: '2026-10-11', endDate: '2026-10-18' }));

    expect(saved.statusCode).toBe(200);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);
    expect(updatedEmails(ready.testApp)[0]).toMatchObject({ to: TRAVELER, from: EMAIL_FROM });
    expect(updatedEmails(ready.testApp)[0]?.subject).toContain('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-056@v1
  test('is not sent when the dates of a Trip that has no Plan are changed', async () => {
    const ready = await aTravelerWithNoTrip();
    const trip = await createdTrip(ready.testApp.app, ready.cookies, aTripInput(ready.destinationId));

    await patchTrip({ ...ready, tripId: trip.id }, withTheRestUnchanged(trip, { startDate: '2026-10-11', endDate: '2026-10-18' }));

    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('is sent once when the Trip is shortened and the Traveler agrees to drop the Days', async () => {
    const ready = await aTravelerWithAPlan();

    const saved = await patchTrip(ready, { ...withTheRestUnchanged(await tripOf(ready), { endDate: '2026-10-14' }), confirmPlanChange: true });

    expect(saved.statusCode).toBe(200);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);
    expect(updatedEmails(ready.testApp)[0]?.text).toMatch(/dates/i);
  });

  // @covers REQ-TRV-056@v1
  test('is sent once, not twice, when the Destination is changed and the Plan is regenerated', async () => {
    const ready = await aTravelerWithAPlan();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });
    ready.testApp.ai.replyWith(aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title: 'Osaka castle walk' })] })) }));

    const saved = await patchTrip(ready, { ...withTheRestUnchanged(await tripOf(ready), { destinationId: osakaId }), confirmPlanChange: true });

    expect(saved.statusCode).toBe(200);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);
  });

  // @covers REQ-TRV-056@v1
  test('is sent once, naming the Trip, when the whole Plan is regenerated', async () => {
    const ready = await aTravelerWithAPlan();

    const again = await regeneratePlanOf(ready);

    expect(again.statusCode).toBe(201);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);
    expect(updatedEmails(ready.testApp)[0]?.subject).toContain('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-056@v1
  test('is not sent for the first Plan a Trip gets', async () => {
    const ready = await aTravelerWithAPlan();

    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('is not sent when a single Day is regenerated', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.ai.replyWith(aDayReplyText(2, [anActivity({ title: 'A new Day 2' })]));

    const regenerated = await regenerateDayOf(ready, 2);

    expect(regenerated.statusCode).toBe(201);
    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('is not sent when a single Activity is edited', async () => {
    const ready = await aTravelerWithAPlan();

    const edited = await editActivityOf(ready, activityAt(ready.plan, 1, 0).id, { startTime: '11:00' });

    expect(edited.statusCode).toBe(200);
    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('is not sent when a chat change is accepted', async () => {
    const ready = await aTravelerWithAShoppingPlan();
    ready.testApp.ai.replyWith(aChatReplyText('Removed shopping.', [changeFor(3, activitiesOnDay(ready.plan, 3).filter((a) => a.category !== 'Shopping'))]));
    const sent = await sendChat(ready, 'Remove the shopping');
    const proposal = messagesOf(sent).find((message) => message.proposal);

    const accepted = await acceptChange(ready, proposal?.id ?? '');

    expect(accepted.statusCode).toBe(200);
    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('is not sent again 20 minutes later, and is sent again 61 minutes after the first', async () => {
    const ready = await aTravelerWithAPlan();
    await regeneratePlanOf(ready);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);

    ready.testApp.clock.advanceBy(20 * MINUTE);
    await regeneratePlanOf(ready);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);

    ready.testApp.clock.advanceBy(41 * MINUTE);
    await regeneratePlanOf(ready);
    expect(updatedEmails(ready.testApp)).toHaveLength(2);
  });

  // @covers REQ-TRV-056@v1
  test('is held back per Trip, so another Trip of the same Traveler is not affected', async () => {
    const ready = await aTravelerWithAPlan();
    await regeneratePlanOf(ready);
    const second = await createdTrip(ready.testApp.app, ready.cookies, aTripInput(await anAddedDestination(ready.testApp, { name: 'Nara' })));
    ready.testApp.ai.replyWith(aPlanReplyText({ dayCount: 8 }));
    await ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${second.id}/plan`, cookies: ready.cookies });

    const again = await ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${second.id}/plan`, cookies: ready.cookies });

    expect(again.statusCode).toBe(201);
    expect(updatedEmails(ready.testApp)).toHaveLength(2);
  });

  // @covers REQ-TRV-056@v1
  // @covers REQ-TRV-060@v1
  test('is not sent to a Traveler who has switched it off for their own account', async () => {
    const ready = await aTravelerWithAPlan();
    await ready.testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload: { notifications: { itineraryUpdated: false } } });

    await regeneratePlanOf(ready);

    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  // @covers REQ-TRV-060@v1
  test('is not sent when an Administrator has switched it off for everyone, though the Traveler has it on', async () => {
    const ready = await aTravelerWithAPlan();
    await switchOffForEveryone(ready.testApp, { itineraryUpdated: false });

    await regeneratePlanOf(ready);

    expect(updatedEmails(ready.testApp)).toEqual([]);
  });

  // @covers REQ-TRV-056@v1
  test('does not stop the Plan being regenerated when the mail service is down, and is sent by the next regeneration once it is up', async () => {
    const ready = await aTravelerWithAPlan();
    ready.testApp.email.setDown(true);

    const regenerated = await regeneratePlanOf(ready);
    ready.testApp.email.setDown(false);
    ready.testApp.clock.advanceBy(DAY / 24 / 60);
    await regeneratePlanOf(ready);

    expect(regenerated.statusCode).toBe(201);
    expect(updatedEmails(ready.testApp)).toHaveLength(1);
  });
});
