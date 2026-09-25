import { describe, expect, test } from 'vitest';
import { aTravelerWithACostedPlan } from '../support/a-costed-journey';
import { openSharedLink, sharePlan, tokenSentTo } from '../support/a-share-api';

describe('the server log', () => {
  // @covers REQ-TRV-058@v1
  test('never holds the token of a share link, however the link is opened, and still logs the request', async () => {
    const lines: string[] = [];
    const ready = await aTravelerWithACostedPlan(undefined, { logStream: { write: (line: string) => void lines.push(line) } });
    await sharePlan(ready, 'friend@example.com');
    const token = tokenSentTo(ready, 'friend@example.com');

    await openSharedLink(ready, token);
    await ready.testApp.app.inject({ method: 'GET', url: `/shared/${token}` });
    await ready.testApp.app.inject({ method: 'GET', url: `/api/shared/${token.slice(0, -1)}X` });

    const log = lines.join('');
    expect(log).toContain('/api/shared/[redacted]');
    expect(log).not.toContain(token);
    expect(log).not.toContain(token.slice(0, 20));
  });
});
