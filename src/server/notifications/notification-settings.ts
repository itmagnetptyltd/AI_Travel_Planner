import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { appSettings } from '../db/schema';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '../../shared/notification-schemas';

/** The Administrator's switches, which apply to everyone (REQ-TRV-060). */
export interface NotificationSettingsService {
  read(): NotificationSettings;
  isOn(event: NotificationEvent): boolean;
  update(change: NotificationSettingsUpdate): NotificationSettings;
}

const keyOf = (event: NotificationEvent): string => `notifications.${event}`;

export function createNotificationSettingsService(deps: { readonly db: TrvDatabase; readonly clock: Clock }): NotificationSettingsService {
  const { db, clock } = deps;

  /** Only a stored `false` switches an event off: anything else, including an unreadable value, leaves it on. */
  const isOn = (event: NotificationEvent): boolean => {
    const row = db.select().from(appSettings).where(eq(appSettings.key, keyOf(event))).get();
    if (!row) return DEFAULT_NOTIFICATION_SETTINGS[event];
    try {
      return JSON.parse(row.value) !== false;
    } catch {
      return true;
    }
  };

  const read = (): NotificationSettings => ({
    tripCreated: isOn('tripCreated'),
    itineraryUpdated: isOn('itineraryUpdated'),
    tripReminder: isOn('tripReminder'),
  });

  return {
    read,
    isOn,
    update(change) {
      const updatedAt = clock.now();
      for (const event of NOTIFICATION_EVENTS) {
        const value = change[event];
        if (value === undefined) continue;
        const stored = JSON.stringify(value);
        db.insert(appSettings)
          .values({ key: keyOf(event), value: stored, updatedAt })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, updatedAt } })
          .run();
      }
      return read();
    },
  };
}
