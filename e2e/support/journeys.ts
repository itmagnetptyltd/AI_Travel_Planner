import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { E2E_OUTBOX_DIR } from '../../playwright.config';

export const PASSWORD = 'amber-lantern-harbour';

interface OutboxMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** A fresh address per test, so tests never depend on each other's data. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function messagesTo(address: string): Promise<OutboxMessage[]> {
  const files = await readdir(E2E_OUTBOX_DIR).catch(() => [] as string[]);
  const messages = await Promise.all(
    files.sort().map(async (file) => JSON.parse(await readFile(join(E2E_OUTBOX_DIR, file), 'utf8')) as OutboxMessage),
  );
  return messages.filter((message) => message.to === address);
}

/** Waits for an email to the address whose subject matches, and returns the link in it as a path. */
export async function linkFromEmail(address: string, subject: RegExp): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      const match = (await messagesTo(address)).reverse().find((m) => subject.test(m.subject));
      link = match?.text.match(/https?:\/\/\S+/)?.[0] ?? '';
      return link;
    })
    .not.toBe('');
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}

export async function registerThroughUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

export async function logInThroughUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function aLoggedInTraveler(page: Page, label: string): Promise<string> {
  const email = uniqueEmail(label);
  await registerThroughUi(page, email);
  await expect(page.getByText('Check your email to confirm your address.')).toBeVisible();
  await logInThroughUi(page, email);
  await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  return email;
}
