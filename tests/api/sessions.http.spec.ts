import { describe, expect, test } from 'vitest';
import { buildTestApp } from '../support/build-test-app';
import { aLoggedInTraveler, aRegisteredTraveler, logIn, sessionCookieFrom } from '../support/a-traveler';

describe('POST /api/sessions', () => {
  // @covers REQ-TRV-002@v1
  test('correct credentials set a session cookie and the Trip list is then returned', async () => {
    const { app } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);

    const loggedIn = await logIn(app, traveler);
    const trips = await app.inject({ method: 'GET', url: '/api/trips', cookies: sessionCookieFrom(loggedIn) });

    expect(loggedIn.statusCode).toBe(200);
    expect(trips.statusCode).toBe(200);
    expect(trips.json()).toEqual({ trips: [] });
  });

  // @covers REQ-TRV-003@v1
  test('a wrong password returns 401 and sets no session cookie', async () => {
    const { app } = await buildTestApp();
    const traveler = await aRegisteredTraveler(app);

    const response = await logIn(app, { ...traveler, password: 'wrong-password-123' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'LOGIN_FAILED' });
    expect(sessionCookieFrom(response)).toEqual({});
  });
});

describe('DELETE /api/sessions/current', () => {
  // @covers REQ-TRV-004@v1
  test('after logging out, the Trip list returns 401', async () => {
    const { app } = await buildTestApp();
    const { cookies } = await aLoggedInTraveler(app);

    const loggedOut = await app.inject({ method: 'DELETE', url: '/api/sessions/current', cookies });
    const trips = await app.inject({ method: 'GET', url: '/api/trips', cookies });

    expect(loggedOut.statusCode).toBe(204);
    expect(trips.statusCode).toBe(401);
  });
});

describe('Trip endpoints without a session', () => {
  // @covers REQ-TRV-005@v1
  test.each([
    ['GET', '/api/trips'],
    ['POST', '/api/trips'],
  ] as const)('%s %s without a session returns 401', async (method, url) => {
    const { app } = await buildTestApp();

    const response = await app.inject(method === 'POST' ? { method, url, payload: {} } : { method, url });

    expect(response.statusCode).toBe(401);
  });
});
