import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { notificationLog } from '../db/schema';
import type { EmailService } from '../email/email-service';
import { emailTripOf, itineraryUpdatedEmail, tripCreatedEmail } from '../email/plan-email-templates';
import type { ItineraryChange, NotificationEvent } from '../../shared/notification-schemas';
import type { TripView } from '../../shared/trip-schemas';
import { decideNotification, type NotificationRecipient } from './notification-policy';
import type { NotificationSettingsService } from './notification-settings';

/**
 * The emails the application sends on its own account of what happened to a Trip. Every rule about whether one is sent
 * lives here, in `decideNotification`; the routes only report what happened. A notification that cannot be sent is
 * reported to `onError` and never undoes or delays what caused it.
 */
export interface NotificationService {
  tripCreated(ownerId: string, trip: TripView): Promise<void>;
  itineraryUpdated(ownerId: string, trip: TripView, change: ItineraryChange): Promise<void>;
}

export interface NotificationDeps {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly settings: NotificationSettingsService;
  readonly appBaseUrl: string;
  readonly recipients: (accountId: string) => Promise<NotificationRecipient | null>;
  readonly onError: (error: unknown, what: string) => void;
}

export function createNotificationService(deps: NotificationDeps): NotificationService {
  const { db, clock, email, settings, appBaseUrl, recipients, onError } = deps;

  const lastSent = (tripId: string, kind: NotificationEvent): Date | null =>
    db
      .select({ sentAt: notificationLog.sentAt })
      .from(notificationLog)
      .where(and(eq(notificationLog.tripId, tripId), eq(notificationLog.kind, kind)))
      .orderBy(desc(notificationLog.sentAt))
      .get()?.sentAt ?? null;

  /**
   * Decides, records the send and only then sends, with nothing awaited in between, so two requests at once cannot both
   * pass the once-an-hour rule. If the mail service fails the record is taken back, so a later change can try again.
   */
  async function notify(
    ownerId: string,
    tripId: string,
    event: NotificationEvent,
    build: (to: string) => Parameters<EmailService['send']>[0],
  ): Promise<void> {
    try {
      const recipient = await recipients(ownerId);
      if (!recipient) return;
      const now = clock.now();
      const decision = decideNotification({ event, everyone: settings.read(), recipient, lastSentAt: lastSent(tripId, event), now });
      if (!decision.send) return;
      const id = randomUUID();
      db.insert(notificationLog).values({ id, tripId, kind: event, sentAt: now }).run();
      try {
        await email.send(build(recipient.email));
      } catch (error) {
        db.delete(notificationLog).where(eq(notificationLog.id, id)).run();
        throw error;
      }
    } catch (error) {
      onError(error, `The ${event} email for Trip ${tripId} could not be sent`);
    }
  }

  return {
    tripCreated: (ownerId, trip) =>
      notify(ownerId, trip.id, 'tripCreated', (to) => tripCreatedEmail({ to, appBaseUrl, trip: emailTripOf(trip) })),

    itineraryUpdated: (ownerId, trip, change) =>
      notify(ownerId, trip.id, 'itineraryUpdated', (to) => itineraryUpdatedEmail({ to, appBaseUrl, trip: emailTripOf(trip), change })),
  };
}
