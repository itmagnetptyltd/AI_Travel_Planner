import { describe, expect, test } from 'vitest';
import { buildTestApp } from '../support/build-test-app';
import { aLoggedInTraveler } from '../support/a-traveler';

describe('profile', () => {
  // @covers REQ-TRV-009@v1
  test('a changed display name is returned when the profile is next read', async () => {
    const { app } = await buildTestApp();
    const { cookies } = await aLoggedInTraveler(app);

    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies,
      payload: { displayName: 'Aiko Tanaka' },
    });
    const profile = await app.inject({ method: 'GET', url: '/api/profile', cookies });

    expect(saved.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({ displayName: 'Aiko Tanaka' });
  });

  // @covers REQ-TRV-010@v1
  test('preferred currency USD, travel style Family and food preference Vegetarian are returned when reread', async () => {
    const { app } = await buildTestApp();
    const { cookies } = await aLoggedInTraveler(app);

    await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies,
      payload: { preferredCurrency: 'USD', defaultTravelStyle: 'Family', foodPreference: 'Vegetarian' },
    });
    const profile = await app.inject({ method: 'GET', url: '/api/profile', cookies });

    expect(profile.json()).toMatchObject({
      preferredCurrency: 'USD',
      defaultTravelStyle: 'Family',
      foodPreference: 'Vegetarian',
    });
  });

  // @covers REQ-TRV-010@v1
  test('a currency outside the list returns 400 naming preferredCurrency', async () => {
    const { app } = await buildTestApp();
    const { cookies } = await aLoggedInTraveler(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      cookies,
      payload: { preferredCurrency: 'CAD' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'preferredCurrency' });
  });
});
