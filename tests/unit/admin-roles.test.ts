import { describe, expect, test } from 'vitest';
import { ROLE_LABELS, ROLES, roleSchema } from '../../src/shared/admin-functions';

describe('the roles an account can hold', () => {
  // @covers REQ-TRV-079@v1
  test('are exactly Traveler and Administrator', () => {
    expect([...ROLES]).toEqual(['traveler', 'administrator']);
    expect(ROLES.map((role) => ROLE_LABELS[role])).toEqual(['Traveler', 'Administrator']);
  });

  // @covers REQ-TRV-079@v1
  test.each(['travel-consultant', 'Travel Consultant', 'travelConsultant', 'consultant', 'TRAVEL_CONSULTANT', ''])(
    'do not include %j, so a change to it is refused',
    (role) => {
      expect(roleSchema.safeParse(role).success).toBe(false);
    },
  );

  // @covers REQ-TRV-079@v1
  test.each(ROLES)('include %s', (role) => {
    expect(roleSchema.parse(role)).toBe(role);
  });
});
