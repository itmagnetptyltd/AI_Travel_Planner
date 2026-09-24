import { describe, expect, test } from 'vitest';
import { buildTestApp } from '../support/build-test-app';
import { aLoggedInTraveler, logIn, sessionCookieFrom } from '../support/a-traveler';
import { accountIdOf, aConfirmedTraveler, aLoggedInAdministrator, aSeededAdministrator } from '../support/an-administrator';

describe('admin access', () => {
  // @covers REQ-TRV-068@v2
  test('every registered admin API route returns 403 to a Traveler', async () => {
    const { app } = await buildTestApp();
    const { cookies } = await aLoggedInTraveler(app);

    const statuses = await Promise.all(
      app.adminRoutes.map(async (route) => {
        const response = await app.inject({
          method: route.method,
          url: route.url.replace(/:[A-Za-z]+/g, 'some-id'),
          cookies,
          payload: {},
        });
        return `${route.method} ${route.url} ${response.statusCode}`;
      }),
    );

    expect(app.adminRoutes.length).toBeGreaterThan(0);
    expect(statuses).toEqual(app.adminRoutes.map((route) => `${route.method} ${route.url} 403`));
  });

  // @covers REQ-TRV-068@v2
  test('GET /api/admin/dashboard as the seeded Administrator returns the five admin functions', async () => {
    const { app, db } = await buildTestApp();
    const administrator = await aSeededAdministrator(db, 'admin@example.com');
    const cookies = sessionCookieFrom(await logIn(app, administrator));

    const response = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { functions: { label: string }[] }).functions.map((f) => f.label)).toEqual([
      'Users',
      'Destinations',
      'Feedback',
      'Notification settings',
      'AI usage limits',
    ]);
  });
});

describe('changing roles', () => {
  // @covers REQ-TRV-068@v2
  test('a confirmed Traveler promoted with confirm: true can then open the admin dashboard', async () => {
    const { app, db, email } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const traveler = await aConfirmedTraveler(app, email);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const promoted = await app.inject({
      method: 'PUT',
      url: `/api/admin/accounts/${travelerId}/role`,
      cookies: adminCookies,
      payload: { role: 'administrator', confirm: true },
    });
    const travelerCookies = sessionCookieFrom(await logIn(app, traveler));
    const dashboard = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies: travelerCookies });

    expect(promoted.statusCode).toBe(200);
    expect(dashboard.statusCode).toBe(200);
  });

  // @covers REQ-TRV-068@v2
  test('a role change without confirm: true returns 400 and changes nothing', async () => {
    const { app, db, email } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const traveler = await aConfirmedTraveler(app, email);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/accounts/${travelerId}/role`,
      cookies: adminCookies,
      payload: { role: 'administrator' },
    });
    const travelerCookies = sessionCookieFrom(await logIn(app, traveler));
    const dashboard = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies: travelerCookies });

    expect(response.statusCode).toBe(400);
    expect(dashboard.statusCode).toBe(403);
  });

  // @covers REQ-TRV-068@v2
  test('promoting a Traveler whose email is not confirmed returns 409 and they still get 403', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const { traveler, cookies: travelerCookies } = await aLoggedInTraveler(app);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/accounts/${travelerId}/role`,
      cookies: adminCookies,
      payload: { role: 'administrator', confirm: true },
    });
    const dashboard = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies: travelerCookies });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'EMAIL_NOT_CONFIRMED' });
    expect(dashboard.statusCode).toBe(403);
  });

  // @covers REQ-TRV-068@v2
  test('an Administrator demoting another returns 200 and the demoted one then gets 403', async () => {
    const { app, db } = await buildTestApp();
    const aCookies = await aLoggedInAdministrator(app, db, 'a@example.com');
    const bCookies = await aLoggedInAdministrator(app, db, 'b@example.com');
    const bId = await accountIdOf(app, aCookies, 'b@example.com');

    const demoted = await app.inject({
      method: 'PUT',
      url: `/api/admin/accounts/${bId}/role`,
      cookies: aCookies,
      payload: { role: 'traveler', confirm: true },
    });
    const dashboard = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies: bCookies });

    expect(demoted.statusCode).toBe(200);
    expect(dashboard.statusCode).toBe(403);
  });

  // @covers REQ-TRV-068@v2
  test('the only Administrator demoting themselves returns 409 and stays an Administrator', async () => {
    const { app, db } = await buildTestApp();
    const cookies = await aLoggedInAdministrator(app, db);
    const selfId = await accountIdOf(app, cookies, 'admin@example.com');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/accounts/${selfId}/role`,
      cookies,
      payload: { role: 'traveler', confirm: true },
    });
    const dashboard = await app.inject({ method: 'GET', url: '/api/admin/dashboard', cookies });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'LAST_ADMINISTRATOR' });
    expect(dashboard.statusCode).toBe(200);
  });
});
