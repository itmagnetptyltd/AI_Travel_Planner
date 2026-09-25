import type { NotificationEvent, NotificationSettings } from '../../shared/notification-schemas';

/** Who a notification would go to, and what they have chosen. */
export interface NotificationRecipient {
  readonly email: string;
  readonly isEmailConfirmed: boolean;
  readonly isDisabled: boolean;
  readonly notifications: NotificationSettings;
}

export type SkipReason = 'disabled' | 'not-confirmed' | 'switched-off-for-everyone' | 'switched-off-by-traveler' | 'within-the-hour';

export type Decision = { readonly send: true } | { readonly send: false; readonly reason: SkipReason };

/** ANSWERS.md, "What counts as a significant change?": at most one Itinerary Updated per Trip per hour. */
const ITINERARY_UPDATED_SPACING_MS = 60 * 60 * 1000;

/**
 * Whether one notification email is sent. A disabled account, or one whose address is not confirmed, gets none. An event
 * an Administrator has switched off is off for everyone whatever a Traveler chose, and one the Traveler has switched off is
 * off for them. Itinerary Updated is also held back while the Trip's last one is less than an hour old.
 */
export function decideNotification(input: {
  readonly event: NotificationEvent;
  readonly everyone: NotificationSettings;
  readonly recipient: NotificationRecipient;
  /** When this kind of email was last sent for this Trip, if ever. */
  readonly lastSentAt: Date | null;
  readonly now: Date;
}): Decision {
  const { event, everyone, recipient, lastSentAt, now } = input;
  if (recipient.isDisabled) return { send: false, reason: 'disabled' };
  if (!recipient.isEmailConfirmed) return { send: false, reason: 'not-confirmed' };
  if (!everyone[event]) return { send: false, reason: 'switched-off-for-everyone' };
  if (!recipient.notifications[event]) return { send: false, reason: 'switched-off-by-traveler' };
  const isTooSoon =
    event === 'itineraryUpdated' && lastSentAt !== null && now.getTime() - lastSentAt.getTime() < ITINERARY_UPDATED_SPACING_MS;
  return isTooSoon ? { send: false, reason: 'within-the-hour' } : { send: true };
}
