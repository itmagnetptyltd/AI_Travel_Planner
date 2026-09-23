import { expect, test } from 'vitest';
import { CURRENCIES } from '../../src/shared/currencies';
import { profileUpdateSchema } from '../../src/shared/profile-schemas';

// @covers REQ-TRV-010@v1
test('the currency list is exactly AUD USD EUR GBP JPY SGD NZD BDT', () => {
  expect([...CURRENCIES]).toEqual(['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'NZD', 'BDT']);
});

// @covers REQ-TRV-010@v1
test('a currency outside the list is refused by the profile schema', () => {
  const result = profileUpdateSchema.safeParse({ preferredCurrency: 'CAD' });

  expect(result.success).toBe(false);
});
