import { eq } from 'drizzle-orm';
import type { TrvDatabase } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import type { EmailService } from '../../src/server/email/email-service';
import { createShareService } from '../../src/server/notifications/share-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import { aDestination } from './a-destination';
import { aPlanCosting, COSTS_TOTALLING_3200 } from './a-budget';
import { aTripInput, anOwner, TODAY } from './a-trip';
import { aTestDatabase } from './build-test-app';
import { aCapturingEmailService } from './capturing-email-service';
import { aFixedClock } from './fixed-clock';

export const PUBLIC_ADDRESS = 'https://trv.example.test';

/**
 * A Traveler with a Trip that has an 8-Day Plan (3200 USD in all), and the share service over them. The mail service
 * can be made to fail, to show that a share which could not be sent is not kept.
 */
export function aShareSetup(options: { readonly displayName?: string | null } = {}) {
  const db: TrvDatabase = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const inbox = aCapturingEmailService();
  let isFailing = false;
  const email: EmailService = {
    async send(message) {
      if (isFailing) throw new Error('The mail service is down.');
      await inbox.send(message);
    },
  };
  const trips = createTripService({ db, clock });
  const store = createPlanStore({ db, clock });
  const destinationId = createDestinationService({ db, clock }).add(aDestination()).id;
  const ownerId = anOwner(db);
  const ownerEmail = db.select().from(accounts).where(eq(accounts.id, ownerId)).get()?.email ?? '';
  const displayName = options.displayName === undefined ? 'Jane Citizen' : options.displayName;

  const addTripWithAPlan = (owner = ownerId): string => {
    const created = trips.create(owner, aTripInput(destinationId));
    if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
    store.save(created.trip.id, aPlanCosting({ days: 8, nightly: 150, costs: COSTS_TOTALLING_3200 }), 'generation');
    return created.trip.id;
  };

  const shares = createShareService({
    db,
    clock,
    email,
    trips,
    store,
    appBaseUrl: PUBLIC_ADDRESS,
    sharers: async (accountId) => (accountId === ownerId ? { email: ownerEmail, displayName } : null),
  });
  return {
    db,
    clock,
    inbox,
    shares,
    trips,
    ownerId,
    ownerEmail,
    tripId: addTripWithAPlan(),
    addTripWithAPlan,
    setMailDown: (isDown: boolean) => {
      isFailing = isDown;
    },
    anotherOwner: () => anOwner(db),
  };
}

/** The token in the link of the most recent email to `address`. */
export function tokenSentTo(inbox: ReturnType<typeof aCapturingEmailService>, address: string): string {
  const message = inbox.sentTo(address).at(-1);
  const match = message?.text.match(/\/shared\/([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`No share link in the latest email to ${address}`);
  return match[1];
}

export { TODAY };
