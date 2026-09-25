import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { E2E_AI_SCRIPT_FILE } from '../../playwright.config';
import { aTravelerInNewContext, uniqueName } from './admin-journeys';
import { logInThroughUi } from './journeys';
import { aDestinationAddedByAdministrator, createTripThroughUi, daysFromToday, openTrip, type TripDetails } from './trip-journeys';

export interface AiScript {
  readonly mode: 'ok' | 'error' | 'hang';
  readonly dayCount?: number;
  /** Put in front of every Activity title, so one generated Plan can be told from another. */
  readonly label?: string;
  /** What a chat message gets back: the reply, and the Days the AI would change with their whole new Activity lists. */
  readonly chat?: {
    readonly reply: string;
    readonly changes?: readonly object[];
    /** Answer with the instructions the AI was sent, as a misbehaving AI might. */
    readonly echoInstructions?: boolean;
  };
}

/** Tells the e2e server's scripted AI what the next request should do. Tests run one at a time, so one file is safe. */
export async function setAiScript(script: AiScript): Promise<void> {
  await mkdir(dirname(E2E_AI_SCRIPT_FILE), { recursive: true });
  await writeFile(E2E_AI_SCRIPT_FILE, JSON.stringify(script));
}

/** The default Trip form dates give a 4-Day Trip, starting a week from today. */
export const TRIP_DAY_COUNT = 4;
export const TRIP_START = () => daysFromToday(7);

export interface TripReadyToPlan {
  readonly page: Page;
  readonly email: string;
  readonly tripName: string;
  readonly destinationName: string;
  readonly admin: Page;
  readonly dayCount: number;
}

/** A confirmed Traveler with a saved Trip of `dayCount` Days (4 unless asked) open on its page, and the AI set to answer. */
export async function aTripReadyToPlan(
  browser: Browser,
  label: string,
  dayCount = TRIP_DAY_COUNT,
  details: Pick<TripDetails, 'budget' | 'currency' | 'adults' | 'children'> = {},
): Promise<TripReadyToPlan> {
  await setAiScript({ mode: 'ok', dayCount });
  const { name: destinationName, admin } = await aDestinationAddedByAdministrator(browser, 'Kyoto');
  const { page, email } = await aTravelerInNewContext(browser, label, { confirmed: true });
  await logInThroughUi(page, email);
  await expect(page.getByRole('heading', { name: 'Your Trips' })).toBeVisible();
  const tripName = uniqueName('Plan Trip');
  await createTripThroughUi(page, { name: tripName, destinationName, endDate: daysFromToday(7 + dayCount - 1), ...details });
  await openTrip(page, tripName);
  return { page, email, tripName, destinationName, admin, dayCount };
}

/** Presses the button that asks the AI for a whole Plan: Generate Plan before there is one, Regenerate Plan after. */
export async function generatePlan(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Re)?generate Plan$/i }).click();
}

/**
 * Every attempt a page makes to reach anywhere but the application's own address. The application's
 * Content-Security-Policy stops such a request before the network sees it, so an attempt is also
 * counted when it fails or is reported as a policy violation.
 */
export function trackForeignRequests(page: Page, ownOrigin: string): () => string[] {
  const foreign: string[] = [];
  const noteIfForeign = (requestUrl: string) => {
    const url = new URL(requestUrl);
    if (url.origin !== ownOrigin && url.protocol.startsWith('http')) foreign.push(requestUrl);
  };
  page.on('request', (request) => noteIfForeign(request.url()));
  page.on('requestfailed', (request) => noteIfForeign(request.url()));
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) foreign.push(`blocked by policy: ${message.text()}`);
  });
  return () => [...foreign];
}

export async function expectDaysShown(page: Page, dayCount = TRIP_DAY_COUNT): Promise<void> {
  for (let index = 0; index < dayCount; index += 1) {
    await expect(page.getByRole('heading', { name: `Day ${index + 1}, ${daysFromToday(7 + index)}` })).toBeVisible();
  }
}
