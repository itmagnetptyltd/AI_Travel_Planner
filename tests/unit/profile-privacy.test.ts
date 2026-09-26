import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAccountService, type AccountService } from '../../src/server/accounts/account-service';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import type { TrvDatabase } from '../../src/server/db/client';
import { profileUpdateSchema } from '../../src/shared/profile-schemas';
import { VALID_PASSWORD } from '../support/a-traveler';
import { aTestDatabase, buildTestApp } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock } from '../support/fixed-clock';
import { routesOf } from '../support/route-table';
import { sourceFilesUnder } from '../support/service-layer-boundaries';

function anAccountService(db: TrvDatabase): AccountService {
  return createAccountService({
    db,
    clock: aFixedClock(),
    email: aCapturingEmailService(),
    breachedPasswords: createListBreachedPasswordChecker([]),
    appBaseUrl: 'http://trv.test',
  });
}

async function anAccount(service: AccountService, email: string): Promise<string> {
  const result = await service.register({ email, password: VALID_PASSWORD });
  if (!result.ok) throw new Error(`Registration failed: ${result.error}`);
  return result.accountId;
}

/** Two Travelers, X with every profile field filled in and Y with different ones. */
async function xAndY() {
  const service = anAccountService(aTestDatabase());
  const x = await anAccount(service, 'xavier@example.com');
  const y = await anAccount(service, 'yolanda@example.com');
  await service.updateProfile(x, { displayName: 'Xavier Xylophone', preferredCurrency: 'EUR', defaultTravelStyle: 'Adventure', foodPreference: 'Vegan', notifications: { itineraryUpdated: false } });
  await service.updateProfile(y, { displayName: 'Yolanda Yellowstone', preferredCurrency: 'JPY', defaultTravelStyle: 'Luxury', foodPreference: 'Halal' });
  return { service, x, y };
}

describe('reading a profile', () => {
  // @covers REQ-TRV-008@v1
  it('gives the fields of the account it is asked for and of no other', async () => {
    const { service, x, y } = await xAndY();

    const profileOfY = await service.getProfile(y);
    const profileOfX = await service.getProfile(x);

    expect(profileOfY).toMatchObject({ displayName: 'Yolanda Yellowstone', preferredCurrency: 'JPY', defaultTravelStyle: 'Luxury', foodPreference: 'Halal' });
    expect(JSON.stringify(profileOfY)).not.toMatch(/Xavier|EUR|Adventure|Vegan/);
    expect(profileOfX).toMatchObject({ displayName: 'Xavier Xylophone', preferredCurrency: 'EUR' });
    expect(JSON.stringify(profileOfX)).not.toMatch(/Yolanda|JPY|Luxury|Halal/);
  });

  // @covers REQ-TRV-008@v1
  it('gives nothing for an identifier that belongs to nobody, so there is nothing to answer with but "not found"', async () => {
    const { service } = await xAndY();

    expect(await service.getProfile('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await service.getProfile('')).toBeNull();
  });

  // @covers REQ-TRV-008@v1
  it('holds only the profile’s own fields: no identifier, no email address, no password and no role', async () => {
    const { service, x } = await xAndY();

    const profile = await service.getProfile(x);

    // A new field is a new thing that must not reach another Traveler: it is added here, on purpose, with that question asked.
    expect(Object.keys(profile ?? {}).sort()).toEqual(['defaultTravelStyle', 'displayName', 'foodPreference', 'notifications', 'preferredCurrency']);
  });

  // @covers REQ-TRV-008@v1
  it('changes only the account it is given, so an update for one Traveler leaves the other’s profile as it was', async () => {
    const { service, x, y } = await xAndY();
    const before = await service.getProfile(x);

    await service.updateProfile(y, { displayName: 'Yolanda Again', preferredCurrency: 'GBP' });

    expect(await service.getProfile(x)).toEqual(before);
  });
});

describe('where a profile is read and changed from', () => {
  const profileRoutes = () => readFileSync('src/server/accounts/profile-routes.ts', 'utf8');

  // @covers REQ-TRV-008@v1
  it('is the session: the profile routes name the account by the session and take no parameter, query or header from the request', () => {
    expect(profileRoutes()).toContain('request.accountId');
    expect(profileRoutes()).not.toMatch(/request\.(params|query|headers|cookies|raw)\b/);
    expect(profileRoutes()).not.toMatch(/\/:[A-Za-z]+/);
  });

  // @covers REQ-TRV-008@v1
  it('is asked for by nothing but the routes that use the session, and the notifications that go to the account’s own address', () => {
    const files = sourceFilesUnder('.', 'src/server').filter((file) => /\.(getProfile|updateProfile)\(/.test(file.content) && !file.path.endsWith('accounts/account-service.ts'));

    expect(files.map((file) => file.path).sort()).toEqual(['src/server/accounts/profile-routes.ts', 'src/server/notifications/notification-services.ts']);
  });

  // @covers REQ-TRV-008@v1
  it('takes an update to nothing but the profile’s own fields, so it cannot name another account', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'Xavier' }).success).toBe(true);
    for (const field of ['id', 'accountId', 'userId', 'email', 'account', 'owner']) {
      expect([field, profileUpdateSchema.safeParse({ displayName: 'Xavier', [field]: 'another' }).success]).toEqual([field, false]);
    }
  });
});

describe('the routes the application has, whatever they are called', () => {
  /** The routes that take an identifier or a token in their address for a Traveler: each is for one of these things, and no other. */
  const TRAVELER_ROUTES_WITH_A_PARAMETER = [/^\/api\/trips\/:id(\/|$)/, /^\/api\/shared\/:token$/, /^\/api\/destinations\/:id$/];
  const ACCOUNT_WORDS = /(^|\/)(accounts?|users?|travelers?|members?|me|profiles?|people|persons?)(\/|$)/;

  async function registeredRoutes() {
    const { app } = await buildTestApp();
    return routesOf(app.printRoutes({ commonPrefix: false }));
  }

  // @covers REQ-TRV-008@v1
  it('are read correctly, so what follows is looking at the real table', async () => {
    const paths = (await registeredRoutes()).map((route) => route.path);

    expect(paths).toEqual(expect.arrayContaining(['/api/profile', '/api/trips/:id/plan', '/api/admin/accounts/:id', '/api/shared/:token']));
    expect(paths.length).toBeGreaterThan(50);
  });

  // @covers REQ-TRV-008@v1
  it('give a Traveler an address with an identifier in it for a Trip, a shared Plan or a Destination, and for nothing else', async () => {
    const routes = await registeredRoutes();

    const unexpected = routes
      .filter((route) => /[:*]/.test(route.path) && !route.path.startsWith('/api/admin/'))
      .filter((route) => !TRAVELER_ROUTES_WITH_A_PARAMETER.some((allowed) => allowed.test(route.path)))
      .map((route) => `${route.methods.join('/')} ${route.path}`);

    expect(unexpected).toEqual([]);
  });

  // @covers REQ-TRV-008@v1
  it('have one route for a Traveler to read or change a profile, which names no one, and the Administrators’ refusal to change one', async () => {
    const routes = await registeredRoutes();

    const withProfile = routes.filter((route) => /profile/i.test(route.path)).map((route) => `${route.methods.join(', ')} ${route.path}`);

    expect(withProfile.sort()).toEqual(['GET, HEAD, PATCH /api/profile', 'PATCH /api/admin/accounts/:id/profile']);
  });

  // @covers REQ-TRV-008@v1
  it('name an account, a user, a Traveler or a person for a Traveler only to register, and nowhere else outside the Administrators’ own', async () => {
    const routes = await registeredRoutes();

    const named = routes
      .filter((route) => !route.path.startsWith('/api/admin/') && ACCOUNT_WORDS.test(route.path))
      .map((route) => `${route.methods.join(', ')} ${route.path}`);

    expect(named.sort()).toEqual(['GET, HEAD, PATCH /api/profile', 'POST /api/accounts']);
  });
});
