import { describe, expect, test } from 'vitest';
import { withSendTimeout } from '../../src/server/email/email-service';
import { aCapturingEmailService } from '../support/capturing-email-service';

const MESSAGE = { to: 'traveler@example.com', subject: 'Hello', text: 'Body' };

describe('a mail service that never answers', () => {
  // @covers REQ-TRV-057@v1
  test('is given up on after the time allowed, so nothing waits on it for ever', async () => {
    const inbox = aCapturingEmailService();
    inbox.setHung(true);

    await expect(withSendTimeout(inbox, 40).send(MESSAGE)).rejects.toThrow(/took longer than 40 ms/);
  });

  // @covers REQ-TRV-057@v1
  test('does not get in the way of one that answers in time', async () => {
    const inbox = aCapturingEmailService();

    await withSendTimeout(inbox, 1_000).send(MESSAGE);

    expect(inbox.sent).toEqual([MESSAGE]);
  });

  // @covers REQ-TRV-057@v1
  test('passes on a failure the mail service reports, rather than hiding it behind the timeout', async () => {
    const inbox = aCapturingEmailService();
    inbox.setDown(true);

    await expect(withSendTimeout(inbox, 1_000).send(MESSAGE)).rejects.toThrow('The mail service is down.');
  });
});
