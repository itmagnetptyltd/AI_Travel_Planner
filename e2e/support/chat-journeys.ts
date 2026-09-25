import { expect, type Locator, type Page } from '@playwright/test';
import { setAiScript, TRIP_DAY_COUNT } from './plan-journeys';

/** An Activity as the scripted AI writes it in a Plan, so a chat change can keep, alter or drop it. */
export const SCRIPTED = {
  morning: { title: 'Morning temple visit', startTime: '09:00', category: 'Activities', estimatedCost: 10 },
  lunch: { title: 'Lunch at a local noodle bar', startTime: '12:30', category: 'Food', estimatedCost: 15 },
  evening: { title: 'Evening stroll through the old town', startTime: '18:00', category: 'Activities', estimatedCost: 0 },
} as const;

export const SUSHI = { title: 'Sushi class', startTime: '16:00', category: 'Activities', estimatedCost: 60 } as const;

type ScriptedActivity = { readonly title: string; readonly startTime: string; readonly category: string; readonly estimatedCost: number };

const written = (activity: ScriptedActivity) => ({
  ...activity,
  durationMinutes: 90,
  location: 'City centre',
  reason: 'Suggested in the chat.',
});

/** What the next chat message gets back: the reply, and the Days the AI would change with their whole new lists. */
export async function theAiWillReply(
  reply: string,
  changes: readonly { readonly dayNumber: number; readonly activities: readonly ScriptedActivity[] }[] | null = null,
  extra: { readonly echoInstructions?: boolean } = {},
): Promise<void> {
  await setAiScript({
    mode: 'ok',
    dayCount: TRIP_DAY_COUNT,
    chat: {
      reply,
      ...(changes ? { changes: changes.map((day) => ({ dayNumber: day.dayNumber, activities: day.activities.map(written) })) } : {}),
      ...extra,
    },
  });
}

export const chatSection = (page: Page): Locator => page.getByRole('region', { name: 'Chat' });
export const chatLog = (page: Page): Locator => page.getByRole('list', { name: 'Chat messages' });
export const suggestedChange = (page: Page): Locator => page.getByRole('group', { name: 'Suggested change' });

export async function sendChat(page: Page, text: string): Promise<void> {
  await chatSection(page).getByLabel('Message', { exact: true }).fill(text);
  await chatSection(page).getByRole('button', { name: 'Send' }).click();
}

export async function expectChat(page: Page, lines: readonly string[]): Promise<void> {
  // Only the messages themselves: a suggested change lists its Activities inside its message.
  const messages = chatLog(page).locator(':scope > li');
  await expect(messages).toHaveCount(lines.length);
  for (const [index, line] of lines.entries()) {
    await expect(messages.nth(index)).toContainText(line);
  }
}
