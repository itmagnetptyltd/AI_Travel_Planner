import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { linkIn, type CapturingEmailService } from './capturing-email-service';

export const VALID_PASSWORD = 'amber-lantern-harbour';

export interface TravelerDetails {
  readonly email: string;
  readonly password: string;
}

export function aTraveler(overrides: Partial<TravelerDetails> = {}): TravelerDetails {
  return { email: 'traveler@example.com', password: VALID_PASSWORD, ...overrides };
}

export function register(app: FastifyInstance, traveler: TravelerDetails): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/api/accounts', payload: traveler });
}

export function logIn(app: FastifyInstance, traveler: TravelerDetails): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/api/sessions', payload: traveler });
}

export function sessionCookieFrom(response: LightMyRequestResponse): Record<string, string> {
  const cookie = response.cookies.find((c) => c.name === 'trv_session');
  return cookie ? { trv_session: cookie.value } : {};
}

export function tokenFromLatestEmail(email: CapturingEmailService, address: string): string {
  const messages = email.sentTo(address);
  const token = linkIn(messages[messages.length - 1]).searchParams.get('token');
  if (!token) {
    throw new Error(`No token in the latest email to ${address}`);
  }
  return token;
}

export async function aRegisteredTraveler(
  app: FastifyInstance,
  overrides: Partial<TravelerDetails> = {},
): Promise<TravelerDetails> {
  const traveler = aTraveler(overrides);
  await register(app, traveler);
  return traveler;
}

export async function aLoggedInTraveler(
  app: FastifyInstance,
  overrides: Partial<TravelerDetails> = {},
): Promise<{ traveler: TravelerDetails; cookies: Record<string, string> }> {
  const traveler = await aRegisteredTraveler(app, overrides);
  const cookies = sessionCookieFrom(await logIn(app, traveler));
  return { traveler, cookies };
}
