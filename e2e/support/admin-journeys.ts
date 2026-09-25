import { expect, type Browser, type Page } from '@playwright/test';
import { SEEDED_ADMIN_EMAIL, SEEDED_ADMIN_PASSWORD } from '../../playwright.config';
import { linkFromEmail, logInThroughUi, registerThroughUi, uniqueEmail } from './journeys';

export async function logInAsAdministrator(page: Page): Promise<void> {
  await logInThroughUi(page, SEEDED_ADMIN_EMAIL, SEEDED_ADMIN_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
}

/** Registers a Traveler in its own browser context, confirming the email address when asked. */
export async function aTravelerInNewContext(
  browser: Browser,
  label: string,
  options: { readonly confirmed: boolean },
): Promise<{ readonly page: Page; readonly email: string }> {
  const page = await (await browser.newContext()).newPage();
  const email = uniqueEmail(label);
  await registerThroughUi(page, email);
  await expect(page.getByText('Check your email to confirm your address.')).toBeVisible();
  if (options.confirmed) {
    await page.goto(await linkFromEmail(email, /Confirm your email/));
    await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible();
  }
  return { page, email };
}

export async function openAccount(page: Page, email: string): Promise<void> {
  await page.goto('/admin/users');
  await page.getByRole('row', { name: new RegExp(email) }).getByRole('link', { name: 'View' }).click();
  await expect(page.getByRole('heading', { name: email })).toBeVisible();
}

/** A Destination name no other test in this run uses. */
export function uniqueName(base: string): string {
  return `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

export async function addDestinationThroughUi(
  page: Page,
  name: string,
  details: { readonly durationDays?: number; readonly country?: string } = {},
): Promise<void> {
  await page.goto('/admin/destinations');
  const form = page.getByRole('form', { name: 'Add a Destination' });
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Country').fill(details.country ?? 'Japan');
  await form.getByLabel('Description').fill(`${name} description`);
  await form.getByLabel('Popular activities').fill(`${name} activities`);
  await form.getByLabel('Recommended duration (days)').fill(String(details.durationDays ?? 3));
  await form.getByLabel('Travel information').fill(`${name} travel information`);
  await form.getByRole('button', { name: 'Add Destination' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}

export async function searchDestinationsThroughUi(page: Page, query: string): Promise<void> {
  await page.goto('/destinations');
  await page.getByLabel('Search Destinations').fill(query);
  await page.getByRole('button', { name: 'Search' }).click();
}
