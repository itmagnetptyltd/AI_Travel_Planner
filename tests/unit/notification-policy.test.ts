import { describe, expect, test } from 'vitest';
import { decideNotification, type NotificationRecipient } from '../../src/server/notifications/notification-policy';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationEvent, type NotificationSettings } from '../../src/shared/notification-schemas';

const NOW = new Date('2026-10-01T09:00:00Z');
const MINUTE = 60_000;

const aRecipient = (overrides: Partial<NotificationRecipient> = {}): NotificationRecipient => ({
  email: 'traveler@example.com',
  isEmailConfirmed: true,
  isDisabled: false,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  ...overrides,
});

const decide = (
  event: NotificationEvent,
  options: { recipient?: NotificationRecipient; everyone?: NotificationSettings; lastSentAt?: Date | null } = {},
) =>
  decideNotification({
    event,
    everyone: options.everyone ?? DEFAULT_NOTIFICATION_SETTINGS,
    recipient: options.recipient ?? aRecipient(),
    lastSentAt: options.lastSentAt ?? null,
    now: NOW,
  });

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);

describe('whether a notification email is sent', () => {
  // @covers REQ-TRV-055@v1
  test('is yes when it is switched on for everyone and for the Traveler', () => {
    expect(decide('tripCreated')).toEqual({ send: true });
  });

  // @covers REQ-TRV-055@v1
  test('is no when the Traveler has switched it off for their own account', () => {
    const recipient = aRecipient({ notifications: { ...DEFAULT_NOTIFICATION_SETTINGS, tripCreated: false } });

    expect(decide('tripCreated', { recipient })).toEqual({ send: false, reason: 'switched-off-by-traveler' });
  });

  // @covers REQ-TRV-055@v1
  test('is no when an Administrator has switched it off for everyone, though the Traveler has it on', () => {
    const everyone = { ...DEFAULT_NOTIFICATION_SETTINGS, tripCreated: false };

    expect(decide('tripCreated', { everyone })).toEqual({ send: false, reason: 'switched-off-for-everyone' });
  });

  // @covers REQ-TRV-060@v1
  test('is decided event by event: switching one off leaves the others on', () => {
    const everyone = { ...DEFAULT_NOTIFICATION_SETTINGS, itineraryUpdated: false };
    const recipient = aRecipient({ notifications: { ...DEFAULT_NOTIFICATION_SETTINGS, tripReminder: false } });

    expect(decide('tripCreated', { everyone, recipient })).toEqual({ send: true });
    expect(decide('itineraryUpdated', { everyone, recipient })).toEqual({ send: false, reason: 'switched-off-for-everyone' });
    expect(decide('tripReminder', { everyone, recipient })).toEqual({ send: false, reason: 'switched-off-by-traveler' });
  });

  // @covers REQ-TRV-056@v1
  test('is no for Itinerary Updated when one was sent 20 minutes ago', () => {
    expect(decide('itineraryUpdated', { lastSentAt: minutesAgo(20) })).toEqual({ send: false, reason: 'within-the-hour' });
  });

  // @covers REQ-TRV-056@v1
  test('is yes for Itinerary Updated when one was sent 61 minutes ago, and at exactly 60', () => {
    expect(decide('itineraryUpdated', { lastSentAt: minutesAgo(61) })).toEqual({ send: true });
    expect(decide('itineraryUpdated', { lastSentAt: minutesAgo(60) })).toEqual({ send: true });
    expect(decide('itineraryUpdated', { lastSentAt: minutesAgo(59) })).toEqual({ send: false, reason: 'within-the-hour' });
  });

  // @covers REQ-TRV-056@v1
  test('is yes for Itinerary Updated when none has been sent for this Trip before', () => {
    expect(decide('itineraryUpdated', { lastSentAt: null })).toEqual({ send: true });
  });

  // @covers REQ-TRV-056@v1
  test('applies the once-an-hour rule to Itinerary Updated only', () => {
    expect(decide('tripCreated', { lastSentAt: minutesAgo(1) })).toEqual({ send: true });
    expect(decide('tripReminder', { lastSentAt: minutesAgo(1) })).toEqual({ send: true });
  });

  // @covers REQ-TRV-092@v1
  test('is no for a disabled Traveler, whatever the switches say', () => {
    expect(decide('tripReminder', { recipient: aRecipient({ isDisabled: true }) })).toEqual({ send: false, reason: 'disabled' });
  });

  // @covers REQ-TRV-092@v1
  test('is no for an account whose email address is not confirmed', () => {
    expect(decide('tripReminder', { recipient: aRecipient({ isEmailConfirmed: false }) })).toEqual({ send: false, reason: 'not-confirmed' });
  });
});
