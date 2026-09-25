import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { destinations, trips } from '../db/schema';
import { tripReminderEmail } from '../email/plan-email-templates';
import { decideNotification } from './notification-policy';
import type { NotificationDeps } from './notification-service';
import { isReminderDue } from './reminder-schedule';

export interface ReminderService {
  /** Sends every reminder that is due now. Resolves with how many were sent, and never rejects. */
  runCheck(): Promise<number>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Only Trips that start within this window (in UTC days) can be due; the exact rule is `isReminderDue`. */
const WINDOW_DAYS_BEFORE = 2;
const WINDOW_DAYS_AFTER = 5;

const isoDate = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * The one reminder each Trip gets. It runs with nobody logged in, from the application itself. A Trip is claimed by a
 * conditional update before its email is sent, so two checks at once cannot both send it, and the claim is given back
 * if the mail service fails so the next check tries again (REQ-TRV-057).
 */
export function createReminderService(deps: NotificationDeps & { readonly timeZone: string }): ReminderService {
  const { db, clock, email, settings, appBaseUrl, recipients, onError, timeZone } = deps;

  const candidates = (now: Date) =>
    db
      .select({
        id: trips.id,
        ownerId: trips.ownerAccountId,
        name: trips.name,
        startDate: trips.startDate,
        endDate: trips.endDate,
        createdAt: trips.createdAt,
        reminderSentAt: trips.reminderSentAt,
        destinationName: destinations.name,
        destinationCountry: destinations.country,
      })
      .from(trips)
      .innerJoin(destinations, eq(destinations.id, trips.destinationId))
      .where(
        and(
          isNull(trips.deletedAt),
          isNull(trips.reminderSentAt),
          gte(trips.startDate, isoDate(new Date(now.getTime() - WINDOW_DAYS_BEFORE * DAY_MS))),
          lte(trips.startDate, isoDate(new Date(now.getTime() + WINDOW_DAYS_AFTER * DAY_MS))),
        ),
      )
      .all();

  async function remind(trip: ReturnType<typeof candidates>[number], now: Date): Promise<boolean> {
    const recipient = await recipients(trip.ownerId);
    if (!recipient) return false;
    const decision = decideNotification({ event: 'tripReminder', everyone: settings.read(), recipient, lastSentAt: null, now });
    if (!decision.send) return false;
    // Claimed only if the Trip is still as it was read: not deleted, and not moved to other dates, since the check began.
    const claimed =
      db
        .update(trips)
        .set({ reminderSentAt: now })
        .where(and(eq(trips.id, trip.id), isNull(trips.reminderSentAt), isNull(trips.deletedAt), eq(trips.startDate, trip.startDate)))
        .run().changes === 1;
    if (!claimed) return false;
    try {
      await email.send(
        tripReminderEmail({
          to: recipient.email,
          appBaseUrl,
          trip: { id: trip.id, name: trip.name, destination: `${trip.destinationName}, ${trip.destinationCountry}`, startDate: trip.startDate, endDate: trip.endDate },
        }),
      );
      return true;
    } catch (error) {
      db.update(trips).set({ reminderSentAt: null }).where(eq(trips.id, trip.id)).run();
      onError(error, `The reminder for Trip ${trip.id} could not be sent`);
      return false;
    }
  }

  return {
    async runCheck() {
      try {
        const now = clock.now();
        let sent = 0;
        for (const trip of candidates(now)) {
          if (isReminderDue({ trip, timeZone, now }) && (await remind(trip, now))) sent += 1;
        }
        return sent;
      } catch (error) {
        onError(error, 'The reminder check failed');
        return 0;
      }
    },
  };
}

export interface ReminderSchedule {
  /** Stops further checks and waits for the one that is running, so nothing uses the database after it is closed. */
  stop(): Promise<void>;
}

/** Runs `check` now and every `everyMs`, never two at once, and never keeps the process alive. A failure is reported, never thrown. */
export function scheduleReminderChecks(check: () => Promise<unknown>, everyMs: number, onError: (error: unknown) => void): ReminderSchedule {
  let running: Promise<unknown> | null = null;
  const run = () => {
    if (running) return;
    const started = check()
      .catch(onError)
      .finally(() => {
        if (running === started) running = null;
      });
    running = started;
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return {
    async stop() {
      clearInterval(timer);
      await running;
    },
  };
}
