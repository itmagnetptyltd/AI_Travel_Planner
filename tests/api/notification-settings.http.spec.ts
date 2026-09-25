import { describe, expect, test } from 'vitest';
import { linkIn } from '../support/capturing-email-service';
import { aConfirmedTraveler, aLoggedInAdministrator } from '../support/an-administrator';
import { logIn, sessionCookieFrom } from '../support/a-traveler';
import { buildTestApp } from '../support/build-test-app';

const ALL_ON = { tripCreated: true, itineraryUpdated: true, tripReminder: true };

async function aTravelerWithSession() {
  const testApp = await buildTestApp();
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email);
  const cookies = sessionCookieFrom(await logIn(testApp.app, traveler));
  return { testApp, traveler, cookies };
}

const readProfile = (ready: Awaited<ReturnType<typeof aTravelerWithSession>>, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'GET', url: '/api/profile', cookies });
const switchTo = (ready: Awaited<ReturnType<typeof aTravelerWithSession>>, notifications: object) =>
  ready.testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload: { notifications } });

describe("a Traveler's own notification switches", () => {
  // @covers REQ-TRV-060@v1
  test('are offered for Trip Created, Itinerary Updated and Trip Reminder, each switched on, to a new Traveler', async () => {
    const ready = await aTravelerWithSession();

    const profile = await readProfile(ready);

    expect(profile.statusCode).toBe(200);
    expect((profile.json() as { notifications: unknown }).notifications).toEqual(ALL_ON);
  });

  // @covers REQ-TRV-060@v1
  test('switch one off, leave the others on, and are still that way after logging in again', async () => {
    const ready = await aTravelerWithSession();

    const saved = await switchTo(ready, { tripReminder: false });
    const again = sessionCookieFrom(await logIn(ready.testApp.app, ready.traveler));

    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { notifications: unknown }).notifications).toEqual({ ...ALL_ON, tripReminder: false });
    expect(((await readProfile(ready, again)).json() as { notifications: unknown }).notifications).toEqual({ ...ALL_ON, tripReminder: false });
  });

  // @covers REQ-TRV-060@v1
  test.each(['accountConfirmation', 'passwordReset', 'itineraryShared'])('refuse a switch for %s with a 400, and change nothing', async (key) => {
    const ready = await aTravelerWithSession();

    const refused = await switchTo(ready, { [key]: false });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(((await readProfile(ready)).json() as { notifications: unknown }).notifications).toEqual(ALL_ON);
  });

  // @covers REQ-TRV-060@v1
  test.each([{}, { notifications: {} }])('change nothing, and are not an error, when the request %j says nothing to change', async (payload) => {
    const ready = await aTravelerWithSession();
    await switchTo(ready, { tripReminder: false });

    const response = await ready.testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { notifications: unknown }).notifications).toEqual({ ...ALL_ON, tripReminder: false });
  });

  // @covers REQ-TRV-060@v1
  test('do not stop a password reset from being sent when all three are switched off', async () => {
    const ready = await aTravelerWithSession();
    const allOff = await switchTo(ready, { tripCreated: false, itineraryUpdated: false, tripReminder: false });
    expect(allOff.statusCode).toBe(200);

    await ready.testApp.app.inject({ method: 'POST', url: '/api/password-resets', payload: { email: ready.traveler.email } });

    const reset = ready.testApp.email.sentTo(ready.traveler.email).at(-1);
    expect(reset?.subject).toBe('Reset your password');
    expect(linkIn(reset).pathname).toBe('/reset-password');
  });
});

describe("an Administrator's notification switches", () => {
  const adminUrl = '/api/admin/notification-settings';

  // @covers REQ-TRV-060@v1
  test('start switched on for every event', async () => {
    const testApp = await buildTestApp();
    const admin = await aLoggedInAdministrator(testApp.app, testApp.db);

    const response = await testApp.app.inject({ method: 'GET', url: adminUrl, cookies: admin });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(ALL_ON);
  });

  // @covers REQ-TRV-060@v1
  test('switch Itinerary Updated off for everyone, and it stays off when read again', async () => {
    const testApp = await buildTestApp();
    const admin = await aLoggedInAdministrator(testApp.app, testApp.db);

    const saved = await testApp.app.inject({ method: 'PUT', url: adminUrl, cookies: admin, payload: { itineraryUpdated: false } });
    const reread = await testApp.app.inject({ method: 'GET', url: adminUrl, cookies: admin });

    expect(saved.statusCode).toBe(200);
    expect(reread.json()).toEqual({ ...ALL_ON, itineraryUpdated: false });
  });

  // @covers REQ-TRV-060@v1
  test('refuse an event that has no switch, with a 400', async () => {
    const testApp = await buildTestApp();
    const admin = await aLoggedInAdministrator(testApp.app, testApp.db);

    const refused = await testApp.app.inject({ method: 'PUT', url: adminUrl, cookies: admin, payload: { passwordReset: false } });

    expect(refused.statusCode).toBe(400);
  });

  // @covers REQ-TRV-060@v1
  test('are not open to a Traveler, or to someone not logged in', async () => {
    const ready = await aTravelerWithSession();

    const asTraveler = await ready.testApp.app.inject({ method: 'GET', url: adminUrl, cookies: ready.cookies });
    const anonymous = await ready.testApp.app.inject({ method: 'GET', url: adminUrl });

    expect(asTraveler.statusCode).toBe(403);
    expect(anonymous.statusCode).toBe(401);
  });
});
