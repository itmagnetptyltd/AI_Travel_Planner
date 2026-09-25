import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { accountIdOf, aConfirmedTraveler } from '../support/an-administrator';
import { logIn, sessionCookieFrom } from '../support/a-traveler';
import { aTripInput, anAddedDestination, anAdministratorSession, createdTrip } from '../support/a-trip';
import { buildTestApp, EMAIL_FROM, type TestApp } from '../support/build-test-app';

const TRAVELER = 'traveler@example.com';
const POINT = new Date('2026-10-07T09:00:00Z');
const MINUTE = 60_000;
const PUBLIC_ADDRESS = 'https://trv.example.test';

type Options = { now?: Date; databasePath?: string };

/** An application whose reminder check runs every 20 ms, with a Trip that starts on 2026-10-10. */
async function anApplicationWithATrip(options: Options = {}) {
  const testApp = await buildTestApp({
    reminderCheckEveryMs: 20,
    appBaseUrl: PUBLIC_ADDRESS,
    ...(options.now ? { now: options.now } : {}),
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
  });
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email: TRAVELER });
  const cookies = sessionCookieFrom(await logIn(testApp.app, traveler));
  const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId));
  return { testApp, cookies, trip, traveler };
}

const moveTo = (testApp: TestApp, to: Date) => testApp.clock.advanceBy(to.getTime() - testApp.clock.now().getTime());
const remindersTo = (testApp: TestApp) => testApp.email.sentTo(TRAVELER).filter((message) => /^Reminder: .* starts on \d{4}-\d\d-\d\d$/.test(message.subject));
const aFewChecks = () => new Promise((resolve) => setTimeout(resolve, 250));

describe('the reminder, sent by the running application', () => {
  // @covers REQ-TRV-057@v1
  test('is sent at 09:00 on 2026-10-07 with nobody logged in, naming the Trip, from the configured sender', async () => {
    const { testApp, trip } = await anApplicationWithATrip();

    moveTo(testApp, POINT);

    await vi.waitFor(() => expect(remindersTo(testApp)).toHaveLength(1));
    expect(remindersTo(testApp)[0]).toMatchObject({ to: TRAVELER, from: EMAIL_FROM });
    expect(remindersTo(testApp)[0]?.subject).toContain(trip.name);
  });

  // @covers REQ-TRV-057@v1
  test('links to the Trip on the public https address', async () => {
    const { testApp, trip } = await anApplicationWithATrip();

    moveTo(testApp, POINT);

    await vi.waitFor(() => expect(remindersTo(testApp)).toHaveLength(1));
    expect(remindersTo(testApp)[0]?.text).toContain(`${PUBLIC_ADDRESS}/trips/${trip.id}`);
  });

  // @covers REQ-TRV-057@v1
  test('is not sent at 08:59', async () => {
    const { testApp } = await anApplicationWithATrip();

    moveTo(testApp, new Date(POINT.getTime() - MINUTE));
    await aFewChecks();

    expect(remindersTo(testApp)).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  test('is sent once, however many checks run afterwards', async () => {
    const { testApp } = await anApplicationWithATrip();
    moveTo(testApp, POINT);
    await vi.waitFor(() => expect(remindersTo(testApp)).toHaveLength(1));

    await aFewChecks();

    expect(remindersTo(testApp)).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('is not sent a second time after the application is stopped and started again over the same database', async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), 'trv-reminder-')), 'trv.sqlite');
    const first = await anApplicationWithATrip({ databasePath });
    moveTo(first.testApp, POINT);
    await vi.waitFor(() => expect(remindersTo(first.testApp)).toHaveLength(1));
    await first.testApp.stop();

    const second = await buildTestApp({ now: POINT, databasePath, reminderCheckEveryMs: 20, appBaseUrl: PUBLIC_ADDRESS });
    await aFewChecks();

    expect(remindersTo(second)).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  test('is never sent for a Trip created on 2026-10-08 that starts on 2026-10-10', async () => {
    const { testApp } = await anApplicationWithATrip({ now: new Date('2026-10-08T10:00:00Z') });

    for (const hour of [0, 24, 47]) {
      moveTo(testApp, new Date(new Date('2026-10-08T10:00:00Z').getTime() + hour * 3_600_000));
      await aFewChecks();
    }

    expect(remindersTo(testApp)).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  // @covers REQ-TRV-060@v1
  test('is not sent to a Traveler who has switched Trip Reminder off for their own account', async () => {
    const { testApp, cookies } = await anApplicationWithATrip();
    await testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies, payload: { notifications: { tripReminder: false } } });

    moveTo(testApp, POINT);
    await aFewChecks();

    expect(remindersTo(testApp)).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  // @covers REQ-TRV-060@v1
  test('is not sent when an Administrator has switched Trip Reminder off for everyone', async () => {
    const { testApp } = await anApplicationWithATrip();
    const admin = await anAdministratorSession(testApp);
    await testApp.app.inject({ method: 'PUT', url: '/api/admin/notification-settings', cookies: admin, payload: { tripReminder: false } });

    moveTo(testApp, POINT);
    await aFewChecks();

    expect(remindersTo(testApp)).toEqual([]);
  });
});

describe('a disabled Traveler', () => {
  const setDisabled = async (testApp: TestApp, isDisabled: boolean) => {
    const admin = await anAdministratorSession(testApp);
    const id = await accountIdOf(testApp.app, admin, TRAVELER);
    const response = await testApp.app.inject({ method: 'POST', url: `/api/admin/accounts/${id}/${isDisabled ? 'disable' : 'enable'}`, cookies: admin });
    expect(response.statusCode).toBe(200);
  };

  // @covers REQ-TRV-092@v1
  test('is sent no reminder when their Trip reaches its reminder point', async () => {
    const { testApp } = await anApplicationWithATrip();
    await setDisabled(testApp, true);

    moveTo(testApp, POINT);
    await aFewChecks();

    expect(remindersTo(testApp)).toEqual([]);
    expect(testApp.email.sentTo(TRAVELER).filter((message) => message.subject.startsWith('Reminder:'))).toEqual([]);
  });

  // @covers REQ-TRV-092@v1
  test('is sent the reminder if they are enabled again before the Trip starts', async () => {
    const { testApp } = await anApplicationWithATrip();
    await setDisabled(testApp, true);
    moveTo(testApp, POINT);
    await aFewChecks();

    await setDisabled(testApp, false);

    await vi.waitFor(() => expect(remindersTo(testApp)).toHaveLength(1));
  });
});
