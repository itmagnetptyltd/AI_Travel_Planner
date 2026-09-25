import { describe, expect, test } from 'vitest';
import { withSender } from '../../src/server/email/email-service';
import { aCapturingEmailService } from '../support/capturing-email-service';

const SENDER = 'no-reply@itmagnet.com.au';

describe('the sender of every email', () => {
  // @covers REQ-TRV-054@v1
  test('is the configured address, stated on the message itself', async () => {
    const inbox = aCapturingEmailService();

    await withSender(inbox, SENDER).send({ to: 'traveler@example.com', subject: 'Hello', text: 'Body' });

    expect(inbox.sent).toEqual([{ from: SENDER, to: 'traveler@example.com', subject: 'Hello', text: 'Body' }]);
  });

  // @covers REQ-TRV-054@v1
  test('cannot be replaced by the caller, so a template can never send as someone else', async () => {
    const inbox = aCapturingEmailService();

    await withSender(inbox, SENDER).send({ from: 'ceo@example.com', to: 'traveler@example.com', subject: 'Hello', text: 'Body' });

    expect(inbox.sent[0]?.from).toBe(SENDER);
  });
});
