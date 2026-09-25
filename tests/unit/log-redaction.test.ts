import { describe, expect, test } from 'vitest';
import { describeMailFailure } from '../../src/server/email/mail-failure';
import { redactSecretsInUrl } from '../../src/server/http/logging';

const TOKEN = 'k3Jx9QmZr2Vb7LwNfT5HcYa0DsUeGp8iOqXn1RhMtAo'; // itm-sdlc:allow-secret - synthetic share token

describe('what the request log is allowed to say about an address', () => {
  // @covers REQ-TRV-058@v1
  test('hides the token in the address of a shared Plan, for the page and for the data behind it', () => {
    expect(redactSecretsInUrl(`/api/shared/${TOKEN}`)).toBe('/api/shared/[redacted]');
    expect(redactSecretsInUrl(`/shared/${TOKEN}`)).toBe('/shared/[redacted]');
  });

  // @covers REQ-TRV-058@v1
  test('keeps a query string, so the rest of the request can still be told apart', () => {
    expect(redactSecretsInUrl(`/shared/${TOKEN}?utm=mail`)).toBe('/shared/[redacted]?utm=mail');
  });

  // @covers REQ-TRV-058@v1
  test('leaves every other address as it was', () => {
    for (const url of ['/api/trips/abc-123/shares', '/api/health', '/trips/abc', '/api/sessions/current', '/']) expect(redactSecretsInUrl(url)).toBe(url);
  });
});

describe('what is logged when a mail service fails', () => {
  // @covers REQ-TRV-058@v1
  test('is the kind of failure and its codes, and never the addresses the mail service reports back', () => {
    const failure = Object.assign(new Error('Recipient rejected: friend@example.com'), {
      code: 'EENVELOPE',
      responseCode: 550,
      command: 'RCPT TO',
      rejected: ['friend@example.com'],
      envelope: { from: 'no-reply@itmagnet.com.au', to: ['friend@example.com'] },
      response: '550 5.1.1 friend@example.com does not exist',
    });

    const described = describeMailFailure(failure);

    expect(described).toEqual({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
    expect(JSON.stringify(described)).not.toContain('friend@example.com');
  });

  // @covers REQ-TRV-058@v1
  test('says so plainly when the failure is not one a mail service reports', () => {
    expect(describeMailFailure(new Error('boom'))).toEqual({});
    expect(describeMailFailure('not an error')).toEqual({});
  });
});
