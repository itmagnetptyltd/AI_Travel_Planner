import { describe, expect, test } from 'vitest';
import { anAdminScenario } from '../support/an-admin-scenario';
import { accountIdOf } from '../support/an-administrator';
import { aRegisteredTraveler } from '../support/a-traveler';

describe('the roles an account can hold, through the API', () => {
  // @covers REQ-TRV-079@v1
  test('are listed as exactly Traveler and Administrator', async () => {
    const { asAdmin } = await anAdminScenario();

    const response = await asAdmin('GET', '/api/admin/roles');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roles: [
        { role: 'traveler', label: 'Traveler' },
        { role: 'administrator', label: 'Administrator' },
      ],
    });
  });

  // @covers REQ-TRV-079@v1
  test.each(['travel-consultant', 'Travel Consultant', 'consultant'])('refuses to give a user the role %s, and the role is unchanged', async (role) => {
    const { testApp, admin, asAdmin } = await anAdminScenario();
    const traveler = await aRegisteredTraveler(testApp.app, { email: 'someone@example.com' });
    const id = await accountIdOf(testApp.app, admin, traveler.email);

    const refused = await asAdmin('PUT', `/api/admin/accounts/${id}/role`, { role, confirm: true });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'role' });
    expect(((await asAdmin('GET', `/api/admin/accounts/${id}`)).json() as { account: { role: string } }).account.role).toBe('traveler');
  });
});
