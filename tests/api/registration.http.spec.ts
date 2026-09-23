import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { accounts } from '../../src/server/db/schema';
import { BREACHED_PASSWORD, buildTestApp } from '../support/build-test-app';
import { linkIn } from '../support/capturing-email-service';
import { HOUR } from '../support/fixed-clock';
import {
  aTraveler,
  logIn,
  register,
  sessionCookieFrom,
  tokenFromLatestEmail,
} from '../support/a-traveler';

describe('POST /api/accounts', () => {
  // @covers REQ-TRV-001@v1
  test('registering creates an account that can then log in', async () => {
    const { app } = await buildTestApp();
    const traveler = aTraveler();

    const registered = await register(app, traveler);
    const loggedIn = await logIn(app, traveler);

    expect(registered.statusCode).toBe(201);
    expect(loggedIn.statusCode).toBe(200);
  });

  // @covers REQ-TRV-001@v1
  test('registering an email that is already registered returns 409 already registered', async () => {
    const { app } = await buildTestApp();
    await register(app, aTraveler());

    const response = await register(app, aTraveler());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  // @covers REQ-TRV-001@v1
  test('an 11-character password returns 400 naming password and creates no account', async () => {
    const { app, db } = await buildTestApp();

    const response = await register(app, aTraveler({ email: 'new@example.com', password: 'abcdefghijk' })); // itm-sdlc:allow-secret - synthetic test password

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'password' });
    expect(db.select().from(accounts).where(eq(accounts.email, 'new@example.com')).all()).toHaveLength(0);
  });

  // @covers REQ-TRV-001@v1
  test('a breached password returns 400 naming password', async () => {
    const { app } = await buildTestApp();

    const response = await register(app, aTraveler({ email: 'new@example.com', password: BREACHED_PASSWORD }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'password' });
  });

  // @covers REQ-TRV-001@v1
  test('registering sends exactly one confirmation email with a link to the registered address', async () => {
    const { app, email } = await buildTestApp();

    await register(app, aTraveler());

    const messages = email.sentTo('traveler@example.com');
    expect(messages).toHaveLength(1);
    expect(linkIn(messages[0]).pathname).toBe('/confirm-email');
  });
});

describe('email confirmation', () => {
  // @covers REQ-TRV-001@v1
  test('an unconfirmed account creating a Trip is refused with confirm-email-first', async () => {
    const { app } = await buildTestApp();
    const traveler = aTraveler();
    await register(app, traveler);
    const cookies = sessionCookieFrom(await logIn(app, traveler));

    const response = await app.inject({ method: 'POST', url: '/api/trips', cookies, payload: {} });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'EMAIL_NOT_CONFIRMED' });
  });

  // @covers REQ-TRV-001@v1
  test('a 23-hour-old confirmation link confirms the account and Trip creation is no longer refused for it', async () => {
    const { app, clock, email } = await buildTestApp();
    const traveler = aTraveler();
    await register(app, traveler);
    const token = tokenFromLatestEmail(email, traveler.email);
    clock.advanceBy(23 * HOUR);

    const confirmed = await app.inject({ method: 'POST', url: '/api/email-confirmations', payload: { token } });
    const cookies = sessionCookieFrom(await logIn(app, traveler));
    const createTrip = await app.inject({ method: 'POST', url: '/api/trips', cookies, payload: {} });

    expect(confirmed.statusCode).toBe(200);
    expect(createTrip.statusCode).not.toBe(403);
  });

  // @covers REQ-TRV-001@v1
  test('a 25-hour-old confirmation link returns 410 and the account stays unconfirmed', async () => {
    const { app, clock, email } = await buildTestApp();
    const traveler = aTraveler();
    await register(app, traveler);
    const token = tokenFromLatestEmail(email, traveler.email);
    clock.advanceBy(25 * HOUR);

    const confirmed = await app.inject({ method: 'POST', url: '/api/email-confirmations', payload: { token } });
    const cookies = sessionCookieFrom(await logIn(app, traveler));
    const createTrip = await app.inject({ method: 'POST', url: '/api/trips', cookies, payload: {} });

    expect(confirmed.statusCode).toBe(410);
    expect(createTrip.statusCode).toBe(403);
  });
});
