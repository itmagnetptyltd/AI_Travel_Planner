import type { AccountService } from '../accounts/account-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import type { EmailService } from '../email/email-service';
import type { PlanStore } from '../plans/plan-store';
import type { TripService } from '../trips/trip-service';
import { createNotificationService, type NotificationDeps, type NotificationService } from './notification-service';
import { createNotificationSettingsService, type NotificationSettingsService } from './notification-settings';
import { createReminderService, type ReminderService } from './reminder-service';
import { createShareService, type ShareService } from './share-service';

export interface NotificationServices {
  readonly settings: NotificationSettingsService;
  readonly notifications: NotificationService;
  readonly reminders: ReminderService;
  readonly shares: ShareService;
}

/** Everything that sends an email about a Trip, built over the same mail service, database and account lookups. */
export function createNotificationServices(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly appBaseUrl: string;
  readonly timezone: string;
  readonly accounts: AccountService;
  readonly trips: TripService;
  readonly store: PlanStore;
  readonly onError: NotificationDeps['onError'];
}): NotificationServices {
  const { db, clock, email, appBaseUrl, accounts } = deps;
  const settings = createNotificationSettingsService({ db, clock });
  const notificationDeps: NotificationDeps = {
    db,
    clock,
    email,
    settings,
    appBaseUrl,
    onError: deps.onError,
    recipients: async (accountId) => {
      const [account, profile] = await Promise.all([accounts.findAccount(accountId), accounts.getProfile(accountId)]);
      return account && profile
        ? { email: account.email, isEmailConfirmed: account.isEmailConfirmed, isDisabled: account.isDisabled, notifications: profile.notifications }
        : null;
    },
  };
  return {
    settings,
    notifications: createNotificationService(notificationDeps),
    reminders: createReminderService({ ...notificationDeps, timeZone: deps.timezone }),
    shares: createShareService({
      db,
      clock,
      email,
      trips: deps.trips,
      store: deps.store,
      appBaseUrl,
      sharers: async (accountId) => {
        const [account, profile] = await Promise.all([accounts.findAccount(accountId), accounts.getProfile(accountId)]);
        return account && profile ? { email: account.email, displayName: profile.displayName } : null;
      },
    }),
  };
}
