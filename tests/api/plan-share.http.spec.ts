import { describe, expect, test } from 'vitest';
import { aTravelerWithACostedPlan, type TravelerWithACostedPlan } from '../support/a-costed-journey';
import { DAY } from '../support/a-day';
import { emailPlan, listShares, openSharedLink, revokeShare, sharePlan, sharedViewOf, sharesOf, tokenSentTo } from '../support/a-share-api';
import { aConfirmedTravelerSession } from '../support/a-trip';

const FRIEND = 'friend@example.com';

async function aTravelerWhoShared(): Promise<TravelerWithACostedPlan & { readonly token: string }> {
  const ready = await aTravelerWithACostedPlan();
  await ready.testApp.app.inject({ method: 'PATCH', url: '/api/profile', cookies: ready.cookies, payload: { displayName: 'Jane Citizen' } });
  const shared = await sharePlan(ready, FRIEND);
  if (shared.statusCode !== 201) throw new Error(`Sharing failed with ${shared.statusCode}`);
  return { ...ready, token: tokenSentTo(ready, FRIEND) };
}

const emailsTo = (ready: TravelerWithACostedPlan, address: string) => ready.testApp.email.sentTo(address).filter((m) => /\/shared\//.test(m.text));

describe('sharing a Trip with another person', () => {
  // @covers REQ-TRV-058@v1
  test('answers 201 and sends one email to that address naming Jane Citizen, and lists the share without its token', async () => {
    const ready = await aTravelerWhoShared();

    expect(emailsTo(ready, FRIEND)).toHaveLength(1);
    expect(emailsTo(ready, FRIEND)[0]?.text).toContain('Jane Citizen');
    const shares = sharesOf(await listShares(ready));
    expect(shares).toMatchObject([{ recipient: FRIEND, isRevoked: false }]);
    expect(JSON.stringify(shares)).not.toContain(ready.token);
  });

  // @covers REQ-TRV-058@v1
  test('gives the email every Day, the total and a link, and the link opens the Plan with no login', async () => {
    const ready = await aTravelerWhoShared();

    const opened = await openSharedLink(ready, ready.token);

    const text = emailsTo(ready, FRIEND)[0]?.text ?? '';
    for (let day = 1; day <= 8; day += 1) expect(text).toContain(`Day ${day},`);
    expect(text).toContain('Estimated total: 3200 USD');
    expect(opened.statusCode).toBe(200);
    expect(sharedViewOf(opened).plan.days).toHaveLength(8);
  });

  // @covers REQ-TRV-058@v1
  test('opens a view that cannot change anything: every write to it is refused', async () => {
    const ready = await aTravelerWhoShared();

    const before = await openSharedLink(ready, ready.token);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await ready.testApp.app.inject({ method, url: `/api/shared/${ready.token}`, payload: {} });
      expect(response.statusCode).toBe(404);
    }

    expect(sharedViewOf(await openSharedLink(ready, ready.token))).toEqual(sharedViewOf(before));
    expect(sharesOf(await listShares(ready))).toHaveLength(1);
  });

  // @covers REQ-TRV-058@v1
  test('gives the browser a view with no identifiers, sent with no caching and no referrer', async () => {
    const ready = await aTravelerWhoShared();

    const opened = await openSharedLink(ready, ready.token);

    for (const secret of [ready.tripId, 'traveler@example.com', ready.token]) expect(opened.body).not.toContain(secret);
    expect(opened.headers['cache-control']).toMatch(/no-store/);
    expect(opened.headers['referrer-policy']).toBe('no-referrer');
  });

  // @covers REQ-TRV-058@v1
  test('refuses a link 31 days old as expired, and shows no Plan', async () => {
    const ready = await aTravelerWhoShared();
    ready.testApp.clock.advanceBy(31 * DAY);

    const opened = await openSharedLink(ready, ready.token);

    expect(opened.statusCode).toBe(410);
    expect(opened.json()).toMatchObject({ code: 'SHARE_EXPIRED' });
    expect(opened.body).not.toContain('Tokyo Family Holiday');
    expect(opened.body).not.toContain('Estimated');
  });

  // @covers REQ-TRV-058@v1
  test('refuses a link its owner has revoked, and shows no Plan', async () => {
    const ready = await aTravelerWhoShared();
    const [share] = sharesOf(await listShares(ready));

    const revoked = await revokeShare(ready, share?.id ?? '');
    const opened = await openSharedLink(ready, ready.token);

    expect(revoked.statusCode).toBe(204);
    expect(opened.statusCode).toBe(404);
    expect(opened.json()).toMatchObject({ code: 'SHARE_NOT_FOUND' });
    expect(opened.body).not.toContain('Tokyo Family Holiday');
    expect(sharesOf(await listShares(ready))).toMatchObject([{ isRevoked: true }]);
  });

  // @covers REQ-TRV-058@v1
  test('refuses a link with one character of its token changed, and shows no Plan', async () => {
    const ready = await aTravelerWhoShared();
    const changed = `${ready.token.slice(0, 20)}${ready.token[20] === 'A' ? 'B' : 'A'}${ready.token.slice(21)}`;

    const opened = await openSharedLink(ready, changed);

    expect(opened.statusCode).toBe(404);
    expect(opened.body).not.toContain('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-058@v1
  test('has a token that does not contain the Trip identifier', async () => {
    const ready = await aTravelerWhoShared();

    expect(ready.token).not.toContain(ready.tripId);
  });

  // @covers REQ-TRV-058@v1
  test('refuses the 11th recipient of a Trip in a day with 429 and the reset time, and sends no email for it', async () => {
    const ready = await aTravelerWithACostedPlan();
    for (let n = 1; n <= 10; n += 1) expect((await sharePlan(ready, `friend${n}@example.com`)).statusCode).toBe(201);

    const refused = await sharePlan(ready, 'friend11@example.com');

    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: 'SHARE_LIMIT_REACHED', limit: 10, resetsAt: '2026-09-24T00:00:00.000Z' });
    expect(emailsTo(ready, 'friend11@example.com')).toEqual([]);
    ready.testApp.clock.advanceBy(DAY);
    expect((await sharePlan(ready, 'friend11@example.com')).statusCode).toBe(201);
  });

  // @covers REQ-TRV-058@v1
  test('tells the Traveler and keeps nothing when the mail service is down', async () => {
    const ready = await aTravelerWithACostedPlan();
    ready.testApp.email.setDown(true);

    const response = await sharePlan(ready, FRIEND);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'EMAIL_FAILED' });
    expect(sharesOf(await listShares(ready))).toEqual([]);
  });

  // @covers REQ-TRV-058@v1
  test('can be done, listed and revoked only by the owner, and a deleted Trip stops its links working', async () => {
    const ready = await aTravelerWhoShared();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');
    const [share] = sharesOf(await listShares(ready));

    expect((await sharePlan(ready, FRIEND, {})).statusCode).toBe(401);
    expect((await sharePlan(ready, FRIEND, other)).statusCode).toBe(404);
    expect((await listShares(ready, other)).statusCode).toBe(404);
    expect((await revokeShare(ready, share?.id ?? '', other)).statusCode).toBe(404);
    expect((await openSharedLink(ready, ready.token)).statusCode).toBe(200);
    await ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });
    expect((await openSharedLink(ready, ready.token)).statusCode).toBe(404);
  });

  // @covers REQ-TRV-058@v1
  test('gives the Plan email its own link, so the Traveler can revoke that too', async () => {
    const ready = await aTravelerWithACostedPlan();
    await emailPlan(ready);

    const [own] = sharesOf(await listShares(ready));

    expect(own).toMatchObject({ recipient: null, isRevoked: false });
    expect((await revokeShare(ready, own?.id ?? '')).statusCode).toBe(204);
  });
});

describe('a burst of requests to send email', () => {
  // @covers REQ-TRV-058@v1
  test('is refused with 429 once the request limit for a minute is passed, so a script cannot fire them off', async () => {
    const ready = await aTravelerWithACostedPlan(undefined, { authRateLimitPerMinute: 3 });
    for (let n = 1; n <= 3; n += 1) expect((await sharePlan(ready, `friend${n}@example.com`)).statusCode).toBe(201);

    const refused = await sharePlan(ready, 'friend4@example.com');

    expect(refused.statusCode).toBe(429);
    expect(emailsTo(ready, 'friend4@example.com')).toEqual([]);
  });

  // @covers REQ-TRV-054@v1
  test('is refused with 429 for the Plan email as well', async () => {
    const ready = await aTravelerWithACostedPlan(undefined, { authRateLimitPerMinute: 3 });
    for (let n = 1; n <= 3; n += 1) expect((await emailPlan(ready)).statusCode).toBe(200);

    expect((await emailPlan(ready)).statusCode).toBe(429);
  });
});

describe('sharing with a malformed address', () => {
  // @covers REQ-TRV-059@v1
  test.each(['friend-at-example', '', 'a@b', 'x@@y.com', 42, null])(
    'refuses %j with a 400 that names the recipient field, and captures no email',
    async (recipient) => {
      const ready = await aTravelerWithACostedPlan();
      const before = ready.testApp.email.sent.length;

      const response = await sharePlan(ready, recipient);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'recipient' });
      expect(ready.testApp.email.sent).toHaveLength(before);
      expect(sharesOf(await listShares(ready))).toEqual([]);
    },
  );

  // @covers REQ-TRV-059@v1
  test('refuses a request with anything else in it, so no field can be smuggled in', async () => {
    const ready = await aTravelerWithACostedPlan();

    const response = await ready.testApp.app.inject({
      method: 'POST',
      url: `/api/trips/${ready.tripId}/shares`,
      cookies: ready.cookies,
      payload: { recipient: FRIEND, bcc: 'spy@example.com' },
    });

    expect(response.statusCode).toBe(400);
    expect(ready.testApp.email.sentTo('spy@example.com')).toEqual([]);
  });
});
