import { z } from 'zod';

/**
 * The emails a Traveler can switch off for their own account and an Administrator can switch off for everyone
 * (REQ-TRV-060). Account emails and shares a Traveler sends themselves are deliberately not here: they cannot be
 * switched off, so there is no key that could say so.
 */
export const NOTIFICATION_EVENTS = ['tripCreated', 'itineraryUpdated', 'tripReminder'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** What became of a Plan that existed when an Itinerary Updated email is sent (REQ-TRV-056). */
export const ITINERARY_CHANGES = ['dates', 'destination', 'plan'] as const;
export type ItineraryChange = (typeof ITINERARY_CHANGES)[number];

export type NotificationSettings = Readonly<Record<NotificationEvent, boolean>>;

/** Every event starts switched on (ANSWERS.md, "Who controls email notifications?"). */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = Object.freeze({
  tripCreated: true,
  itineraryUpdated: true,
  tripReminder: true,
});

export const NOTIFICATION_LABELS: Readonly<Record<NotificationEvent, string>> = Object.freeze({
  tripCreated: 'Trip Created',
  itineraryUpdated: 'Itinerary Updated',
  tripReminder: 'Trip Reminder',
});

/** Any of the switches, and nothing else: a key that is not an event is refused, not ignored. */
export const notificationSettingsSchema = z
  .object({ tripCreated: z.boolean(), itineraryUpdated: z.boolean(), tripReminder: z.boolean() })
  .partial()
  .strict();

export type NotificationSettingsUpdate = z.infer<typeof notificationSettingsSchema>;
