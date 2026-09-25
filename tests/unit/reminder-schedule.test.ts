import { describe, expect, test } from 'vitest';
import { isReminderDue, reminderPoint } from '../../src/server/notifications/reminder-schedule';

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

const aTrip = (overrides: Partial<Parameters<typeof isReminderDue>[0]['trip']> = {}) => ({
  startDate: '2026-10-10',
  createdAt: at('2026-09-23T09:00:00Z'),
  reminderSentAt: null,
  ...overrides,
});

describe('the point at which a Trip reminder is due', () => {
  // @covers REQ-TRV-057@v1
  test.each([
    ['UTC', '2026-10-07T09:00:00.000Z'],
    ['Australia/Sydney', '2026-10-06T22:00:00.000Z'],
    ['America/Los_Angeles', '2026-10-07T16:00:00.000Z'],
    ['Asia/Tokyo', '2026-10-07T00:00:00.000Z'],
  ])('is 09:00 on 2026-10-07 in %s for a Trip starting 2026-10-10', (timeZone, expected) => {
    expect(reminderPoint('2026-10-10', timeZone).toISOString()).toBe(expected);
  });

  // @covers REQ-TRV-057@v1
  test('stays 09:00 local when daylight saving begins in Sydney between the reminder and the start', () => {
    expect(reminderPoint('2026-10-06', 'Australia/Sydney').toISOString()).toBe('2026-10-02T23:00:00.000Z');
    expect(reminderPoint('2026-10-07', 'Australia/Sydney').toISOString()).toBe('2026-10-03T22:00:00.000Z');
    expect(reminderPoint('2026-10-08', 'Australia/Sydney').toISOString()).toBe('2026-10-04T22:00:00.000Z');
  });

  // @covers REQ-TRV-057@v1
  test('stays 09:00 local when daylight saving ends in Los Angeles', () => {
    expect(reminderPoint('2026-11-04', 'America/Los_Angeles').toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(reminderPoint('2026-11-01', 'America/Los_Angeles').toISOString()).toBe('2026-10-29T16:00:00.000Z');
  });

  // @covers REQ-TRV-057@v1
  test('counts back across a month and a year boundary', () => {
    expect(reminderPoint('2026-11-02', 'UTC').toISOString()).toBe('2026-10-30T09:00:00.000Z');
    expect(reminderPoint('2027-01-02', 'UTC').toISOString()).toBe('2026-12-30T09:00:00.000Z');
  });
});

describe('whether a Trip reminder is due', () => {
  const POINT = at('2026-10-07T09:00:00Z');

  // @covers REQ-TRV-057@v1
  test('is due at 09:00 three days before the start', () => {
    expect(isReminderDue({ trip: aTrip(), timeZone: 'UTC', now: POINT })).toBe(true);
  });

  // @covers REQ-TRV-057@v1
  test('is not due at 08:59', () => {
    expect(isReminderDue({ trip: aTrip(), timeZone: 'UTC', now: new Date(POINT.getTime() - 60_000) })).toBe(false);
  });

  // @covers REQ-TRV-057@v1
  test('is not due once it has been sent and recorded', () => {
    expect(isReminderDue({ trip: aTrip({ reminderSentAt: POINT }), timeZone: 'UTC', now: new Date(POINT.getTime() + HOUR) })).toBe(false);
  });

  // @covers REQ-TRV-057@v1
  test('is not due for a Trip created on 2026-10-08 that starts on 2026-10-10, at any hour up to the start', () => {
    const trip = aTrip({ createdAt: at('2026-10-08T10:00:00Z') });

    for (let hours = 0; hours <= 72; hours += 1) {
      expect(isReminderDue({ trip, timeZone: 'UTC', now: new Date(at('2026-10-08T10:00:00Z').getTime() + hours * HOUR) })).toBe(false);
    }
  });

  // @covers REQ-TRV-057@v1
  test('is due for a Trip created before the reminder point, including at the very point', () => {
    expect(isReminderDue({ trip: aTrip({ createdAt: POINT }), timeZone: 'UTC', now: POINT })).toBe(true);
    expect(isReminderDue({ trip: aTrip({ createdAt: new Date(POINT.getTime() + 1) }), timeZone: 'UTC', now: POINT })).toBe(false);
  });

  // @covers REQ-TRV-057@v1
  test('is still due later, up to the start, when the application was not running at 09:00', () => {
    expect(isReminderDue({ trip: aTrip(), timeZone: 'UTC', now: at('2026-10-09T23:59:00Z') })).toBe(true);
  });

  // @covers REQ-TRV-057@v1
  test('is not due once the Trip has started, in the configured timezone', () => {
    expect(isReminderDue({ trip: aTrip(), timeZone: 'UTC', now: at('2026-10-10T00:00:00Z') })).toBe(false);
    expect(isReminderDue({ trip: aTrip(), timeZone: 'Australia/Sydney', now: at('2026-10-09T13:00:00Z') })).toBe(false);
    expect(isReminderDue({ trip: aTrip(), timeZone: 'Australia/Sydney', now: at('2026-10-09T12:59:00Z') })).toBe(true);
  });

  // @covers REQ-TRV-057@v1
  test('follows the configured timezone: due at 09:00 Sydney time and not a minute before', () => {
    expect(isReminderDue({ trip: aTrip(), timeZone: 'Australia/Sydney', now: at('2026-10-06T22:00:00Z') })).toBe(true);
    expect(isReminderDue({ trip: aTrip(), timeZone: 'Australia/Sydney', now: at('2026-10-06T21:59:00Z') })).toBe(false);
  });
});
