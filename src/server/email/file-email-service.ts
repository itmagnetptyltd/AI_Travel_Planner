import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EmailMessage, EmailService } from './email-service';

/**
 * Writes each message as a JSON file instead of sending it. Used by the
 * browser tests, which read the outbox to follow emailed links.
 */
export function createFileEmailService(outboxDir: string): EmailService {
  return {
    async send(message: EmailMessage): Promise<void> {
      await mkdir(outboxDir, { recursive: true });
      const fileName = `${Date.now()}-${randomUUID()}.json`;
      await writeFile(join(outboxDir, fileName), JSON.stringify(message), 'utf8');
    },
  };
}
