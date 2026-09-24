import { describe, expect, test } from 'vitest';
import { buildTestApp } from '../support/build-test-app';
import { aLoggedInTraveler, aRegisteredTraveler, logIn } from '../support/a-traveler';
import { accountIdOf, aLoggedInAdministrator } from '../support/an-administrator';

describe('managing user accounts', () => {
  // @covers REQ-TRV-071@v2
  test('GET /api/admin/accounts lists both Travelers by email address', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    await aRegisteredTraveler(app, { email: 'first@example.com' });
    await aRegisteredTraveler(app, { email: 'second@example.com' });

    const response = await app.inject({ method: 'GET', url: '/api/admin/accounts', cookies: adminCookies });

    const emails = (response.json() as { accounts: { email: string }[] }).accounts.map((a) => a.email);
    expect(emails).toEqual(expect.arrayContaining(['first@example.com', 'second@example.com']));
  });

  // @covers REQ-TRV-071@v2
  test('after disable, logging in as that Traveler returns 401', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const traveler = await aRegisteredTraveler(app);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const disabled = await app.inject({
      method: 'POST',
      url: `/api/admin/accounts/${travelerId}/disable`,
      cookies: adminCookies,
    });
    const login = await logIn(app, traveler);

    expect(disabled.statusCode).toBe(200);
    expect(login.statusCode).toBe(401);
  });

  // @covers REQ-TRV-071@v2
  test('after re-enable, logging in as that Traveler returns 200', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const traveler = await aRegisteredTraveler(app);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);
    await app.inject({ method: 'POST', url: `/api/admin/accounts/${travelerId}/disable`, cookies: adminCookies });

    const enabled = await app.inject({
      method: 'POST',
      url: `/api/admin/accounts/${travelerId}/enable`,
      cookies: adminCookies,
    });
    const login = await logIn(app, traveler);

    expect(enabled.statusCode).toBe(200);
    expect(login.statusCode).toBe(200);
  });

  // @covers REQ-TRV-071@v2
  test('viewing an account offers view, disable and change role, and no profile edit or delete', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const traveler = await aRegisteredTraveler(app);
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const response = await app.inject({ method: 'GET', url: `/api/admin/accounts/${travelerId}`, cookies: adminCookies });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ actions: ['view', 'disable', 'change-role'] });
  });

  // @covers REQ-TRV-071@v2
  test('an Administrator changing a Traveler profile through the API gets 403 and the profile is unchanged', async () => {
    const { app, db } = await buildTestApp();
    const adminCookies = await aLoggedInAdministrator(app, db);
    const { traveler, cookies: travelerCookies } = await aLoggedInTraveler(app);
    await app.inject({ method: 'PATCH', url: '/api/profile', cookies: travelerCookies, payload: { displayName: 'Aiko' } });
    const travelerId = await accountIdOf(app, adminCookies, traveler.email);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/accounts/${travelerId}/profile`,
      cookies: adminCookies,
      payload: { displayName: 'Changed by admin' },
    });
    const profile = await app.inject({ method: 'GET', url: '/api/profile', cookies: travelerCookies });

    expect(response.statusCode).toBe(403);
    expect(profile.json()).toMatchObject({ displayName: 'Aiko' });
  });
});
