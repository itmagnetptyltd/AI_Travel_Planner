import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../support/build-test-app';
import { linkIn } from '../support/capturing-email-service';
import { MINUTE } from '../support/fixed-clock';
import { aRegisteredTraveler, logIn, tokenFromLatestEmail } from '../support/a-traveler';

const NEW_PASSWORD = 'violet-meadow-compass'; // itm-sdlc:allow-secret - synthetic test password

function requestReset(app: FastifyInstance, email: string) {
  return app.inject({ method: 'POST', url: '/api/password-resets', payload: { email } });
}

function completeReset(app: FastifyInstance, token: string) {
  return app.inject({
    method: 'POST',
    url: '/api/password-resets/complete',
    payload: { token, newPassword: NEW_PASSWORD },
  });
}

describe('password reset', () => {
  // @covers REQ-TRV-002@v1
  test('requesting a reset sends exactly one reset email with a link to that address', async () => {
    const { app, email } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);

    const response = await requestReset(app, traveler.email);

    const resets = email.sentTo(traveler.email).filter((m) => linkIn(m).pathname === '/reset-password');
    expect(response.statusCode).toBe(202);
    expect(resets).toHaveLength(1);
  });

  // @covers REQ-TRV-002@v1
  test('a 50-minute-old reset link sets the new password; the new one logs in and the old one does not', async () => {
    const { app, clock, email } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);
    await requestReset(app, traveler.email);
    const token = tokenFromLatestEmail(email, traveler.email);
    clock.advanceBy(50 * MINUTE);

    const reset = await completeReset(app, token);

    expect(reset.statusCode).toBe(200);
    expect((await logIn(app, { ...traveler, password: NEW_PASSWORD })).statusCode).toBe(200);
    expect((await logIn(app, traveler)).statusCode).toBe(401);
  });

  // @covers REQ-TRV-002@v1
  test('a reset link used a second time returns 410 and the password is unchanged', async () => {
    const { app, email } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);
    await requestReset(app, traveler.email);
    const token = tokenFromLatestEmail(email, traveler.email);
    await completeReset(app, token);

    const second = await app.inject({
      method: 'POST',
      url: '/api/password-resets/complete',
      payload: { token, newPassword: 'another-new-password' }, // itm-sdlc:allow-secret - synthetic test password
    });

    expect(second.statusCode).toBe(410);
    expect((await logIn(app, { ...traveler, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  // @covers REQ-TRV-002@v1
  test('a 61-minute-old reset link returns 410 and the password is unchanged', async () => {
    const { app, clock, email } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);
    await requestReset(app, traveler.email);
    const token = tokenFromLatestEmail(email, traveler.email);
    clock.advanceBy(61 * MINUTE);

    const reset = await completeReset(app, token);

    expect(reset.statusCode).toBe(410);
    expect((await logIn(app, traveler)).statusCode).toBe(200);
  });
});
