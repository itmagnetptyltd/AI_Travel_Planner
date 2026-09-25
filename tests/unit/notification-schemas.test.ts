import { describe, expect, test } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_EVENTS, notificationSettingsSchema } from '../../src/shared/notification-schemas';
import { profileUpdateSchema } from '../../src/shared/profile-schemas';

describe('the switches a Traveler and an Administrator have', () => {
  // @covers REQ-TRV-060@v1
  test('are exactly Trip Created, Itinerary Updated and Trip Reminder, and all start switched on', () => {
    expect([...NOTIFICATION_EVENTS]).toEqual(['tripCreated', 'itineraryUpdated', 'tripReminder']);
    expect(DEFAULT_NOTIFICATION_SETTINGS).toEqual({ tripCreated: true, itineraryUpdated: true, tripReminder: true });
  });

  // @covers REQ-TRV-060@v1
  test('can be changed one at a time', () => {
    expect(notificationSettingsSchema.parse({ tripReminder: false })).toEqual({ tripReminder: false });
  });

  // @covers REQ-TRV-060@v1
  test.each(['accountConfirmation', 'passwordReset', 'itineraryShared', 'planEmail'])(
    'offer no switch for %s, so a request to change it is refused',
    (key) => {
      expect(notificationSettingsSchema.safeParse({ [key]: false }).success).toBe(false);
      expect(profileUpdateSchema.safeParse({ notifications: { [key]: false } }).success).toBe(false);
    },
  );

  // @covers REQ-TRV-060@v1
  test('must be true or false, not text', () => {
    expect(notificationSettingsSchema.safeParse({ tripCreated: 'no' }).success).toBe(false);
  });

  // @covers REQ-TRV-060@v1
  test('travel with the profile a Traveler saves', () => {
    expect(profileUpdateSchema.parse({ notifications: { tripCreated: false } })).toEqual({ notifications: { tripCreated: false } });
  });
});
