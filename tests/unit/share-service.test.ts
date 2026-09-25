import { describe, expect, test } from 'vitest';
import { planShares } from '../../src/server/db/schema';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { DAY } from '../support/a-day';
import { aShareSetup, tokenSentTo } from '../support/a-share-setup';

const FRIEND = 'friend@example.com';

describe('sharing a Trip with someone by email address', () => {
  // @covers REQ-TRV-058@v1
  test('sends one email to that address, naming Jane Citizen as the sharer', async () => {
    const { shares, ownerId, tripId, inbox } = aShareSetup();

    const result = await shares.shareWithRecipient(ownerId, tripId, FRIEND);

    expect(result.ok).toBe(true);
    expect(inbox.sent).toHaveLength(1);
    expect(inbox.sent[0]).toMatchObject({ to: FRIEND });
    expect(inbox.sent[0]?.text).toContain('Jane Citizen');
  });

  // @covers REQ-TRV-058@v1
  test('names the sharer by email address when they have no display name, so the recipient can tell who sent it', async () => {
    const { shares, ownerId, ownerEmail, tripId, inbox } = aShareSetup({ displayName: null });

    await shares.shareWithRecipient(ownerId, tripId, FRIEND);

    expect(inbox.sent[0]?.text).toContain(ownerEmail);
  });

  // @covers REQ-TRV-058@v1
  test('refuses the 11th recipient of a Trip in a day, and sends no email for it', async () => {
    const { shares, ownerId, tripId, inbox } = aShareSetup();
    for (let n = 1; n <= 10; n += 1) expect((await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`)).ok).toBe(true);

    const refused = await shares.shareWithRecipient(ownerId, tripId, 'friend11@example.com');

    expect(refused).toMatchObject({ ok: false, error: 'limit-reached', limit: 10 });
    expect(inbox.sent).toHaveLength(10);
    expect(inbox.sentTo('friend11@example.com')).toEqual([]);
  });

  // @covers REQ-TRV-058@v1
  test('says when the limit is over: the start of the next day, UTC', async () => {
    const { shares, ownerId, tripId } = aShareSetup();
    for (let n = 1; n <= 10; n += 1) await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`);

    const refused = await shares.shareWithRecipient(ownerId, tripId, 'friend11@example.com');

    expect(refused).toMatchObject({ ok: false, error: 'limit-reached', resetsAt: new Date('2026-09-24T00:00:00.000Z') });
  });

  // @covers REQ-TRV-058@v1
  test('counts per Trip, so another Trip of the same Traveler can still be shared', async () => {
    const { shares, ownerId, tripId, addTripWithAPlan } = aShareSetup();
    for (let n = 1; n <= 10; n += 1) await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`);

    const other = await shares.shareWithRecipient(ownerId, addTripWithAPlan(), 'friend11@example.com');

    expect(other.ok).toBe(true);
  });

  // @covers REQ-TRV-058@v1
  test('counts per day, so the next day starts again', async () => {
    const { shares, ownerId, tripId, clock } = aShareSetup();
    for (let n = 1; n <= 10; n += 1) await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`);
    clock.advanceBy(DAY);

    expect((await shares.shareWithRecipient(ownerId, tripId, 'friend11@example.com')).ok).toBe(true);
  });

  // @covers REQ-TRV-054@v1
  test("does not use up a recipient when the Traveler emails the Plan to themselves", async () => {
    const { shares, ownerId, tripId } = aShareSetup();
    for (let n = 1; n <= 9; n += 1) await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`);

    await shares.emailToOwner(ownerId, tripId);

    expect((await shares.shareWithRecipient(ownerId, tripId, 'friend10@example.com')).ok).toBe(true);
  });

  // @covers REQ-TRV-059@v1
  test.each(['friend-at-example', '', '   ', 'a@b', 'x@@y.com', 'a b@c.com', `${'a'.repeat(250)}@example.com`])(
    'refuses %j as a recipient, naming the recipient field, and sends and keeps nothing',
    async (recipient) => {
      const { shares, ownerId, tripId, inbox, db } = aShareSetup();

      const result = await shares.shareWithRecipient(ownerId, tripId, recipient);

      expect(result).toEqual({ ok: false, error: 'invalid-recipient', field: 'recipient' });
      expect(inbox.sent).toEqual([]);
      expect(db.select().from(planShares).all()).toEqual([]);
    },
  );

  // @covers REQ-TRV-058@v1
  test('keeps and counts nothing when the mail service is down, and tells the Traveler', async () => {
    const { shares, ownerId, tripId, db, setMailDown } = aShareSetup();
    setMailDown(true);

    const result = await shares.shareWithRecipient(ownerId, tripId, FRIEND);

    expect(result).toMatchObject({ ok: false, error: 'email-failed' });
    expect(db.select().from(planShares).all()).toEqual([]);
    setMailDown(false);
    for (let n = 1; n <= 10; n += 1) expect((await shares.shareWithRecipient(ownerId, tripId, `friend${n}@example.com`)).ok).toBe(true);
  });

  // @covers REQ-TRV-058@v1
  test('is refused for a Trip that has no Plan, and for a Trip that is not theirs', async () => {
    const { shares, ownerId, trips, anotherOwner, tripId } = aShareSetup();
    const bare = trips.create(ownerId, { name: 'No plan', destinationId: trips.listForOwner(ownerId, {})[0]?.destination.id ?? '', startDate: '2026-10-10', endDate: '2026-10-12', adults: 1, budget: 100, currency: 'USD' });
    if (!bare.ok) throw new Error(bare.error);

    expect(await shares.shareWithRecipient(ownerId, bare.trip.id, FRIEND)).toMatchObject({ ok: false, error: 'no-plan' });
    expect(await shares.shareWithRecipient(anotherOwner(), tripId, FRIEND)).toMatchObject({ ok: false, error: 'not-found' });
  });
});

describe('opening a share link', () => {
  async function aLinkTo(setup = aShareSetup()) {
    await setup.shares.shareWithRecipient(setup.ownerId, setup.tripId, FRIEND);
    return { ...setup, token: tokenSentTo(setup.inbox, FRIEND) };
  }

  // @covers REQ-TRV-058@v1
  test('shows the Plan, the estimates and the recommendation notice, with nobody logged in', async () => {
    const { shares, token } = await aLinkTo();

    const opened = shares.view(token);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.view.trip.name).toBe('Tokyo Family Holiday');
    expect(opened.view.plan.days).toHaveLength(8);
    expect(opened.view.estimates.total).toBe(3200);
    expect(opened.view.notice).toBe(PLAN_RECOMMENDATION_NOTICE);
  });

  // @covers REQ-TRV-058@v1
  test('has a token that does not contain the Trip identifier', async () => {
    const { token, tripId } = await aLinkTo();

    expect(token).not.toContain(tripId);
  });

  // @covers REQ-TRV-058@v1
  test('gives no identifier and no account email, so it cannot be used to find anything else', async () => {
    const { shares, token, tripId, ownerId, ownerEmail } = await aLinkTo();

    const text = JSON.stringify(shares.view(token));

    for (const secret of [tripId, ownerId, ownerEmail, FRIEND, token]) expect(text).not.toContain(secret);
  });

  // @covers REQ-TRV-058@v1
  test('is refused as expired after 31 days, and still works after 29', async () => {
    const { shares, token, clock } = await aLinkTo();
    clock.advanceBy(29 * DAY);
    expect(shares.view(token).ok).toBe(true);

    clock.advanceBy(2 * DAY);

    expect(shares.view(token)).toEqual({ ok: false, error: 'expired' });
  });

  // @covers REQ-TRV-058@v1
  test('is refused once its owner has revoked it', async () => {
    const { shares, token, ownerId, tripId } = await aLinkTo();
    const [share] = shares.list(ownerId, tripId) ?? [];

    expect(shares.revoke(ownerId, tripId, share?.id ?? '')).toBe(true);

    expect(shares.view(token)).toEqual({ ok: false, error: 'not-found' });
  });

  // @covers REQ-TRV-058@v1
  test('is refused when any one character of the token is changed, at every position', async () => {
    const { shares, token } = await aLinkTo();

    for (let position = 0; position < token.length; position += 1) {
      const changed = `${token.slice(0, position)}${token[position] === 'A' ? 'B' : 'A'}${token.slice(position + 1)}`;
      expect(shares.view(changed)).toEqual({ ok: false, error: 'not-found' });
    }
  });

  // @covers REQ-TRV-058@v1
  test('stops working while the Trip is deleted, and works again if it is restored', async () => {
    const { shares, token, trips, ownerId, tripId } = await aLinkTo();
    trips.softDelete(ownerId, tripId);
    expect(shares.view(token)).toEqual({ ok: false, error: 'not-found' });

    trips.restore(ownerId, tripId);

    expect(shares.view(token).ok).toBe(true);
  });

  // @covers REQ-TRV-058@v1
  test('is kept only as a hash: the database holds no row containing the token', async () => {
    const { db, token } = await aLinkTo();

    expect(JSON.stringify(db.select().from(planShares).all())).not.toContain(token);
  });

  // @covers REQ-TRV-058@v1
  test('cannot be listed or revoked by someone who does not own the Trip', async () => {
    const { shares, ownerId, tripId, anotherOwner } = await aLinkTo();
    const [share] = shares.list(ownerId, tripId) ?? [];
    const stranger = anotherOwner();

    expect(shares.list(stranger, tripId)).toBeNull();
    expect(shares.revoke(stranger, tripId, share?.id ?? '')).toBe(false);
  });

  // @covers REQ-TRV-054@v1
  test('is made for the Traveler themselves by the Plan email, and listed with no recipient', async () => {
    const { shares, ownerId, tripId, ownerEmail, inbox } = aShareSetup();

    const sent = await shares.emailToOwner(ownerId, tripId);

    expect(sent).toEqual({ ok: true, sentTo: ownerEmail });
    expect(inbox.sentTo(ownerEmail)).toHaveLength(1);
    expect(shares.list(ownerId, tripId)?.map((share) => share.recipient)).toEqual([null]);
    expect(shares.view(tokenSentTo(inbox, ownerEmail)).ok).toBe(true);
  });
});
