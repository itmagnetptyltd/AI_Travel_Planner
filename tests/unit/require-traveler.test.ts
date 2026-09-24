import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { expect, test } from 'vitest';
import { requireTraveler } from '../../src/server/accounts/require-traveler';
import { createSessionService } from '../../src/server/accounts/session-service';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';

// @covers REQ-TRV-005@v1
test('requireTraveler refuses a request with no valid session', async () => {
  const app = Fastify();
  await app.register(cookie);
  const sessions = createSessionService(aTestDatabase(), aFixedClock());
  app.get('/guarded', { preHandler: requireTraveler(sessions) }, async () => ({ reached: true }));

  const response = await app.inject({
    method: 'GET',
    url: '/guarded',
    cookies: { trv_session: 'not-a-session' },
  });

  expect(response.statusCode).toBe(401);
  await app.close();
});
