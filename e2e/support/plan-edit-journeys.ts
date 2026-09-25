import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import {
  aTripReadyToPlan,
  expectDaysShown,
  generatePlan,
  type TripReadyToPlan,
} from './plan-journeys';

/** The titles the scripted AI gives every Day, in time order. */
export const MORNING = 'Morning temple visit';
export const LUNCH = 'Lunch at a local noodle bar';
export const EVENING = 'Evening stroll through the old town';

export const daySection = (page: Page, dayNumber: number): Locator =>
  page.getByRole('region', { name: new RegExp(`^Day ${dayNumber},`) });

/** The Activities of a Day as their one-line headings, whether or not any is opened. */
export const headlinesOf = (page: Page, dayNumber: number): Locator => daySection(page, dayNumber).locator('button[aria-expanded]');

export const activityItem = (page: Page, dayNumber: number, title: string): Locator =>
  daySection(page, dayNumber).getByRole('listitem').filter({ hasText: title });

/** Opens an Activity, which shows its details and what can be done to it. */
export async function openActivity(page: Page, dayNumber: number, title: string): Promise<Locator> {
  const item = activityItem(page, dayNumber, title);
  await item.locator('button[aria-expanded]').click();
  return item;
}

/** A confirmed Traveler with a Trip of `dayCount` Days that already has a generated Plan on show. */
export async function aTripWithAPlan(browser: Browser, label: string, dayCount = 4): Promise<TripReadyToPlan> {
  const ready = await aTripReadyToPlan(browser, label, dayCount);
  await generatePlan(ready.page);
  await expectDaysShown(ready.page, dayCount);
  return ready;
}

export interface TypedActivity {
  readonly title: string;
  readonly startTime: string;
  readonly duration: string;
  readonly cost: string;
  readonly location: string;
}

export async function fillActivityForm(form: Locator, activity: TypedActivity): Promise<void> {
  await form.getByLabel('Title').fill(activity.title);
  await form.getByLabel('Start time').fill(activity.startTime);
  await form.getByLabel('Duration (minutes)').fill(activity.duration);
  await form.getByLabel('Estimated cost').fill(activity.cost);
  await form.getByLabel('Location').fill(activity.location);
}

/** Changes the start time of an opened Activity and saves it. */
export async function changeStartTime(page: Page, item: Locator, startTime: string): Promise<void> {
  await item.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = item.getByRole('form', { name: 'Edit Activity' });
  await form.getByLabel('Start time').fill(startTime);
  await form.getByRole('button', { name: 'Save Activity' }).click();
  await expect(form).toHaveCount(0);
}

export async function removeActivity(item: Locator): Promise<void> {
  await item.getByRole('button', { name: 'Remove', exact: true }).click();
}

/** Moves an opened Activity to another Day. */
export async function moveActivityToDay(item: Locator, dayNumber: number): Promise<void> {
  await item.getByRole('button', { name: 'Move to another Day' }).click();
  await item.getByLabel('Move to').selectOption(String(dayNumber));
  await item.getByRole('button', { name: 'Move', exact: true }).click();
}

export const confirmation = (page: Page): Locator => page.getByRole('group', { name: 'Confirm regeneration' });
