import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import type { EmailService } from '../email/email-service';
import { emailTripOf, planEmail, sharedEmail } from '../email/plan-email-templates';
import { publicPlan } from '../plans/public-plan';
import type { PlanStore } from '../plans/plan-store';
import type { TripService } from '../trips/trip-service';
import { PLAN_RECOMMENDATION_NOTICE } from '../../shared/plan-notice';
import { recipientSchema, SHARE_DAILY_LIMIT, type ShareSummary, type SharedPlanView } from '../../shared/share-schemas';
import { estimatesOf } from '../../shared/trip-budget';
import { createShareStore, type ShareRow, type ShareStore } from './share-store';
import { hashShareToken, isWellFormedToken, newShareToken, shareExpiry } from './share-token';

/** Who is sharing: the address, and the name to give the recipient, if the Traveler has one. */
export interface Sharer {
  readonly email: string;
  readonly displayName: string | null;
}

export type ShareFailure =
  | { readonly ok: false; readonly error: 'not-found' }
  | { readonly ok: false; readonly error: 'no-plan' }
  | { readonly ok: false; readonly error: 'email-failed'; readonly cause: unknown };

export type ShareResult =
  | { readonly ok: true; readonly share: ShareSummary }
  | ShareFailure
  | { readonly ok: false; readonly error: 'invalid-recipient'; readonly field: 'recipient' }
  | { readonly ok: false; readonly error: 'limit-reached'; readonly limit: number; readonly resetsAt: Date };

export type OwnEmailResult = { readonly ok: true; readonly sentTo: string } | ShareFailure;

export type ViewResult = { readonly ok: true; readonly view: SharedPlanView } | { readonly ok: false; readonly error: 'not-found' | 'expired' };

export interface ShareService {
  /** Emails the Plan to another person with a link to a read-only view. Kept and counted only if the email was sent. */
  shareWithRecipient(ownerId: string, tripId: string, recipient: string): Promise<ShareResult>;
  /** Emails the Plan to the Traveler's own account address, with a link of its own. It does not count as a recipient. */
  emailToOwner(ownerId: string, tripId: string): Promise<OwnEmailResult>;
  /** The links made for a Trip, or null when the Trip is not the caller's. */
  list(ownerId: string, tripId: string): ShareSummary[] | null;
  revoke(ownerId: string, tripId: string, shareId: string): boolean;
  /** What a link shows, with no login. An unknown, altered, revoked or deleted-Trip link is all just `not-found`. */
  view(token: string): ViewResult;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The start of the UTC day, the same day the AI limits use. */
const startOfUtcDay = (at: Date): Date => new Date(Math.floor(at.getTime() / DAY_MS) * DAY_MS);

const summaryOf = (row: ShareRow): ShareSummary => ({
  id: row.id,
  recipient: row.recipientEmail,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  isRevoked: row.revokedAt !== null,
});

export function createShareService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly trips: TripService;
  readonly store: PlanStore;
  readonly appBaseUrl: string;
  readonly sharers: (accountId: string) => Promise<Sharer | null>;
  readonly shares?: ShareStore;
}): ShareService {
  const { db, clock, email, trips, store, appBaseUrl, sharers } = deps;
  const shares = deps.shares ?? createShareStore(db);

  /** Sends, and if the mail service cannot, takes the link back so nothing is kept that nobody was told of. */
  async function sendOrTakeBack(row: ShareRow, send: () => Promise<void>): Promise<ShareFailure | null> {
    try {
      await send();
      return null;
    } catch (cause) {
      shares.remove(row.id);
      return { ok: false, error: 'email-failed', cause };
    }
  }

  return {
    async shareWithRecipient(ownerId, tripId, recipient) {
      const trip = trips.getForOwner(ownerId, tripId);
      const sharer = trip ? await sharers(ownerId) : null;
      if (!trip || !sharer) return { ok: false, error: 'not-found' };
      const plan = store.current(tripId);
      if (!plan) return { ok: false, error: 'no-plan' };
      const address = recipientSchema.safeParse(recipient);
      if (!address.success) return { ok: false, error: 'invalid-recipient', field: 'recipient' };

      const now = clock.now();
      const since = startOfUtcDay(now);
      const { token, hash } = newShareToken();
      const made = db.transaction((tx) => {
        if (shares.countRecipientsSince(tripId, since, tx) >= SHARE_DAILY_LIMIT) return null;
        return shares.insert({ tripId, tokenHash: hash, recipientEmail: address.data, createdAt: now, expiresAt: shareExpiry(now) }, tx);
      });
      if (!made) return { ok: false, error: 'limit-reached', limit: SHARE_DAILY_LIMIT, resetsAt: new Date(since.getTime() + DAY_MS) };

      const message = sharedEmail({
        to: address.data,
        appBaseUrl,
        token,
        trip: emailTripOf(trip),
        plan,
        sharer: sharer.displayName ?? sharer.email,
      });
      const failure = await sendOrTakeBack(made, () => email.send(message));
      return failure ?? { ok: true, share: summaryOf(made) };
    },

    async emailToOwner(ownerId, tripId) {
      const trip = trips.getForOwner(ownerId, tripId);
      const owner = trip ? await sharers(ownerId) : null;
      if (!trip || !owner) return { ok: false, error: 'not-found' };
      const plan = store.current(tripId);
      if (!plan) return { ok: false, error: 'no-plan' };

      const now = clock.now();
      const { token, hash } = newShareToken();
      const made = shares.insert({ tripId, tokenHash: hash, recipientEmail: null, createdAt: now, expiresAt: shareExpiry(now) });
      const message = planEmail({ to: owner.email, appBaseUrl, token, trip: emailTripOf(trip), plan });
      const failure = await sendOrTakeBack(made, () => email.send(message));
      return failure ?? { ok: true, sentTo: owner.email };
    },

    list(ownerId, tripId) {
      return trips.getForOwner(ownerId, tripId) ? shares.listForTrip(tripId).map(summaryOf) : null;
    },

    revoke(ownerId, tripId, shareId) {
      return trips.getForOwner(ownerId, tripId) ? shares.revoke(tripId, shareId, clock.now()) : false;
    },

    view(token) {
      if (!isWellFormedToken(token)) return { ok: false, error: 'not-found' };
      const row = shares.findByHash(hashShareToken(token));
      if (!row || row.revokedAt !== null) return { ok: false, error: 'not-found' };
      if (row.expiresAt.getTime() <= clock.now().getTime()) return { ok: false, error: 'expired' };
      const trip = shares.linkedTrip(row.tripId);
      const plan = trip ? store.current(row.tripId) : null;
      if (!trip || !plan) return { ok: false, error: 'not-found' };
      return {
        ok: true,
        view: {
          trip: {
            name: trip.name,
            destination: { name: trip.destinationName, country: trip.destinationCountry },
            startDate: trip.startDate,
            endDate: trip.endDate,
          },
          plan: publicPlan(plan),
          estimates: estimatesOf(plan),
          notice: PLAN_RECOMMENDATION_NOTICE,
          expiresAt: row.expiresAt.toISOString(),
        },
      };
    },
  };
}
