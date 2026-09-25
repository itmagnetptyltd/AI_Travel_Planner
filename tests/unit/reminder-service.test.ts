import { describe, expect, test } from 'vitest';
import { createNotificationSettingsService } from '../../src/server/notifications/notification-settings';
import { createReminderService } from '../../src/server/notifications/reminder-service';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createTripService } from '../../src/server/trips/trip-service';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../src/shared/notification-schemas';
import { aDestination } from '../support/a-destination';
import { aTripInput, anOwner } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock, HOUR, MINUTE } from '../support/fixed-clock';

const POINT = new Date('2026-10-07T09:00:00Z');
const PUBLIC = 'https://trv.example.test';

/** A Traveler with a Trip starting 2026-10-10, created at `createdAt`, and the reminder service over them, timed in `timeZone`. */
function aReminderSetup(options: { createdAt?: Date; timeZone?: string; whileLookingUpTheTraveler?: () => void } = {}) {
  const db = aTestDatabase();
  const clock = aFixedClock(options.createdAt ?? new Date('2026-09-23T09:00:00Z'));
  const inbox = aCapturingEmailService();
  const trips = createTripService({ db, clock });
  const ownerId = anOwner(db);
  const created = trips.create(ownerId, aTripInput(createDestinationService({ db, clock }).add(aDestination()).id));
  if (!created.ok) throw new Error(created.error);
  const traveler = { isDisabled: false, isEmailConfirmed: true, notifications: DEFAULT_NOTIFICATION_SETTINGS };
  const errors: unknown[] = [];
  const settings = createNotificationSettingsService({ db, clock });
  const reminders = createReminderService({
    db,
    clock,
    email: inbox,
    settings,
    appBaseUrl: PUBLIC,
    timeZone: options.timeZone ?? 'UTC',
    recipients: async (accountId) => {
      options.whileLookingUpTheTraveler?.();
      return accountId === ownerId ? { email: 'traveler@example.com', ...traveler } : null;
    },
    onError: (error) => errors.push(error),
  });
  const setClock = (to: Date) => clock.advanceBy(to.getTime() - clock.now().getTime());
  return { db, clock, inbox, reminders, trips, tripId: created.trip.id, ownerId, traveler, settings, errors, setClock };
}

describe('the reminder check', () => {
  // @covers REQ-TRV-057@v1
  test('sends one reminder, naming the Trip, to its owner at 09:00 on 2026-10-07 for a Trip starting 2026-10-10', async () => {
    const setup = aReminderSetup();
    setup.setClock(POINT);

    const sent = await setup.reminders.runCheck();

    expect(sent).toBe(1);
    expect(setup.inbox.sent).toHaveLength(1);
    expect(setup.inbox.sent[0]).toMatchObject({ to: 'traveler@example.com' });
    expect(setup.inbox.sent[0]?.subject).toContain('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-057@v1
  test('links to the Trip on the public https address', async () => {
    const setup = aReminderSetup();
    setup.setClock(POINT);

    await setup.reminders.runCheck();

    expect(setup.inbox.sent[0]?.text).toContain(`${PUBLIC}/trips/${setup.tripId}`);
    expect(setup.inbox.sent[0]?.text).toContain('https://');
  });

  // @covers REQ-TRV-057@v1
  test('sends nothing at 08:59', async () => {
    const setup = aReminderSetup();
    setup.setClock(new Date(POINT.getTime() - MINUTE));

    expect(await setup.reminders.runCheck()).toBe(0);
    expect(setup.inbox.sent).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  test('sends no further reminder once it has been sent and recorded against the Trip', async () => {
    const setup = aReminderSetup();
    setup.setClock(POINT);
    await setup.reminders.runCheck();

    setup.clock.advanceBy(HOUR);
    await setup.reminders.runCheck();
    setup.clock.advanceBy(24 * HOUR);
    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('sends one email between two checks that run at the same time', async () => {
    const setup = aReminderSetup();
    setup.setClock(POINT);

    await Promise.all([setup.reminders.runCheck(), setup.reminders.runCheck(), setup.reminders.runCheck()]);

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('sends none for a Trip created on 2026-10-08 that starts on 2026-10-10, however often it runs', async () => {
    const setup = aReminderSetup({ createdAt: new Date('2026-10-08T10:00:00Z') });

    for (let hours = 0; hours <= 60; hours += 1) {
      await setup.reminders.runCheck();
      setup.clock.advanceBy(HOUR);
    }

    expect(setup.inbox.sent).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  test('is timed in the configured timezone: 09:00 Sydney time is 22:00 UTC the evening before', async () => {
    const setup = aReminderSetup({ timeZone: 'Australia/Sydney' });
    setup.setClock(new Date('2026-10-06T21:59:00Z'));
    await setup.reminders.runCheck();
    expect(setup.inbox.sent).toEqual([]);

    setup.setClock(new Date('2026-10-06T22:00:00Z'));
    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('sends none for a Trip that has been deleted, and one again if it is restored before it starts', async () => {
    const setup = aReminderSetup();
    setup.trips.softDelete(setup.ownerId, setup.tripId);
    setup.setClock(POINT);
    await setup.reminders.runCheck();
    expect(setup.inbox.sent).toEqual([]);

    setup.trips.restore(setup.ownerId, setup.tripId);
    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('does not record the reminder when the mail service is down, so the next check tries again', async () => {
    const setup = aReminderSetup();
    setup.setClock(POINT);
    setup.inbox.setDown(true);
    expect(await setup.reminders.runCheck()).toBe(0);
    expect(setup.errors).toHaveLength(1);

    setup.inbox.setDown(false);
    setup.clock.advanceBy(15 * MINUTE);
    expect(await setup.reminders.runCheck()).toBe(1);

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  // @covers REQ-TRV-060@v1
  test('sends none to a Traveler who has switched Trip Reminder off for their own account', async () => {
    const setup = aReminderSetup();
    setup.traveler.notifications = { ...DEFAULT_NOTIFICATION_SETTINGS, tripReminder: false };
    setup.setClock(POINT);

    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toEqual([]);
  });

  // @covers REQ-TRV-057@v1
  // @covers REQ-TRV-060@v1
  test('sends none when an Administrator has switched Trip Reminder off for everyone', async () => {
    const setup = aReminderSetup();
    setup.settings.update({ tripReminder: false });
    setup.setClock(POINT);

    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toEqual([]);
  });

  // @covers REQ-TRV-060@v1
  test('sends the reminder if the switch is turned back on before the Trip starts', async () => {
    const setup = aReminderSetup();
    setup.settings.update({ tripReminder: false });
    setup.setClock(POINT);
    await setup.reminders.runCheck();
    expect(setup.inbox.sent).toEqual([]);

    setup.settings.update({ tripReminder: true });
    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-092@v1
  test('sends nothing to a disabled Traveler whose Trip reaches its reminder point', async () => {
    const setup = aReminderSetup();
    setup.traveler.isDisabled = true;
    setup.setClock(POINT);

    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toEqual([]);
  });

  // @covers REQ-TRV-092@v1
  test('sends the reminder to a Traveler who is enabled again before the Trip starts', async () => {
    const setup = aReminderSetup();
    setup.traveler.isDisabled = true;
    setup.setClock(POINT);
    await setup.reminders.runCheck();

    setup.traveler.isDisabled = false;
    await setup.reminders.runCheck();

    expect(setup.inbox.sent).toHaveLength(1);
  });

  // @covers REQ-TRV-057@v1
  test('sends none for a Trip deleted after the check began, and does not spend its reminder', async () => {
    let onLookup: () => void = () => undefined;
    const setup = aReminderSetup({ whileLookingUpTheTraveler: () => onLookup() });
    setup.setClock(POINT);
    onLookup = () => setup.trips.softDelete(setup.ownerId, setup.tripId);

    expect(await setup.reminders.runCheck()).toBe(0);
    onLookup = () => undefined;
    setup.trips.restore(setup.ownerId, setup.tripId);

    expect(setup.inbox.sent).toEqual([]);
    expect(await setup.reminders.runCheck()).toBe(1);
  });

  // @covers REQ-TRV-057@v1
  test('sends none for a Trip whose dates were changed after the check began, and sends the next check the new dates', async () => {
    let onLookup: () => void = () => undefined;
    const setup = aReminderSetup({ whileLookingUpTheTraveler: () => onLookup() });
    setup.setClock(POINT);
    onLookup = () => {
      setup.trips.update(setup.ownerId, setup.tripId, { startDate: '2026-10-11', endDate: '2026-10-18' });
    };

    expect(await setup.reminders.runCheck()).toBe(0);
    onLookup = () => undefined;

    expect(setup.inbox.sent).toEqual([]);
    setup.setClock(new Date('2026-10-08T09:00:00Z'));
    expect(await setup.reminders.runCheck()).toBe(1);
    expect(setup.inbox.sent[0]?.text).toContain('2026-10-11');
  });
});
