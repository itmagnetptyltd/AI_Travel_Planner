import { describe, expect, test } from 'vitest';
import type { ShareSummary } from '../../src/shared/share-schemas';
import {
  emailedMessage,
  linkProblemMessage,
  recipientLabel,
  revokeLabel,
  shareFailureMessage,
  shareStatus,
} from '../../src/web/components/share-view-state';

const NOW = new Date('2026-09-25T09:00:00Z');

const aShare = (overrides: Partial<ShareSummary> = {}): ShareSummary => ({
  id: 'share-1',
  recipient: 'friend@example.com',
  createdAt: '2026-09-25T08:00:00.000Z',
  expiresAt: '2026-10-25T08:00:00.000Z',
  isRevoked: false,
  ...overrides,
});

describe('how a link is listed', () => {
  // @covers REQ-TRV-058@v1
  test('names the person it was sent to, and says so when it is the Traveler\'s own Plan email', () => {
    expect(recipientLabel(aShare())).toBe('friend@example.com');
    expect(recipientLabel(aShare({ recipient: null }))).toBe('Your own Plan email');
  });

  // @covers REQ-TRV-058@v1
  test('says until when it works, that it has expired, or that it was revoked', () => {
    expect(shareStatus(aShare(), NOW)).toBe('Works until 2026-10-25');
    expect(shareStatus(aShare({ expiresAt: '2026-09-24T08:00:00.000Z' }), NOW)).toBe('Expired');
    expect(shareStatus(aShare({ isRevoked: true }), NOW)).toBe('Revoked');
  });

  // @covers REQ-TRV-058@v1
  test('calls a link that is both revoked and expired revoked', () => {
    expect(shareStatus(aShare({ isRevoked: true, expiresAt: '2026-09-24T08:00:00.000Z' }), NOW)).toBe('Revoked');
  });
});

describe('the button that revokes a link', () => {
  // @covers REQ-TRV-058@v1
  test('names the person and when the link was sent, so two links to the same address can be told apart', () => {
    const first = revokeLabel(aShare({ createdAt: '2026-09-25T08:00:00.000Z' }));
    const second = revokeLabel(aShare({ createdAt: '2026-09-25T09:30:00.000Z' }));

    expect(first).toBe('Revoke link for friend@example.com sent 2026-09-25 08:00 UTC');
    expect(second).not.toBe(first);
  });

  // @covers REQ-TRV-058@v1
  test('tells the Traveler’s own Plan emails apart the same way', () => {
    expect(revokeLabel(aShare({ recipient: null }))).toBe('Revoke link for Your own Plan email sent 2026-09-25 08:00 UTC');
  });
});

describe('what the Traveler is told about emailing and sharing', () => {
  // @covers REQ-TRV-054@v1
  test('says which address the Plan was emailed to', () => {
    expect(emailedMessage('traveler@example.com')).toBe('The Plan was emailed to traveler@example.com.');
  });

  // @covers REQ-TRV-059@v1
  test('asks for a valid address when the recipient is refused', () => {
    expect(shareFailureMessage({ code: 'VALIDATION_FAILED', field: 'recipient' })).toBe('Enter a valid email address.');
  });

  // @covers REQ-TRV-058@v1
  test('gives the server\'s own words when the daily limit is reached or the email could not be sent', () => {
    expect(shareFailureMessage({ code: 'SHARE_LIMIT_REACHED', message: 'You have shared this Trip with 10 people today.' })).toBe(
      'You have shared this Trip with 10 people today.',
    );
    expect(shareFailureMessage({ code: 'EMAIL_FAILED', message: 'The email could not be sent. Nothing was shared. Try again.' })).toBe(
      'The email could not be sent. Nothing was shared. Try again.',
    );
  });

  // @covers REQ-TRV-058@v1
  test('has plain words for anything else, so a failure is never silent', () => {
    expect(shareFailureMessage({ code: 'NETWORK' })).toMatch(/could not be shared/i);
  });
});

describe('what a shared link says when it cannot be opened', () => {
  // @covers REQ-TRV-058@v1
  test('says an expired link has expired, and any other refused link is not valid, and shows no more', () => {
    expect(linkProblemMessage(410)).toBe('This link has expired.');
    expect(linkProblemMessage(404)).toBe('This link is not valid.');
    expect(linkProblemMessage(0)).toMatch(/could not be opened/i);
  });
});
