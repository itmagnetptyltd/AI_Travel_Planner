import type { ChatMessage } from '../../src/shared/chat-schemas';
import type { PlanActivity, SavedPlan } from '../../src/shared/plan-schemas';
import { asChange } from './a-chat-plan';
import { aPlanReplyText, anActivity } from './a-plan-reply';
import { aTravelerWithATrip, generatePlan, type TravelerWithTrip } from './a-saved-plan-journey';

type Ready = Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>;

/** What the AI sends back in a chat: a reply and, optionally, the Days it changes with their whole new Activity lists. */
export function aChatReplyText(reply: string, changes: readonly { dayNumber: number; activities: readonly object[] }[] | null = null): string {
  return JSON.stringify({ reply, changes });
}

export const changeFor = (dayNumber: number, activities: readonly PlanActivity[]) => ({ dayNumber, activities: activities.map(asChange) });

/** A Traveler whose 8-Day Plan has a shopping Activity on Day 3: three Activities on Day 3, two on every other Day. */
export async function aTravelerWithAShoppingPlan(
  options: Parameters<typeof aTravelerWithATrip>[0] = {},
): Promise<TravelerWithTrip & { readonly plan: SavedPlan }> {
  const ready = await aTravelerWithATrip(options);
  const days = Array.from({ length: 8 }, (_, index) => ({
    dayNumber: index + 1,
    activities: [
      anActivity({ title: `Morning walk ${index + 1}`, startTime: '09:00', location: 'Pontocho Alley' }),
      anActivity({ title: `Lunch ${index + 1}`, startTime: '12:30', category: 'Food' }),
      ...(index === 2 ? [anActivity({ title: 'Shopping at Nishiki market', startTime: '15:00', category: 'Shopping', estimatedCost: 40 })] : []),
    ],
  }));
  ready.testApp.ai.replyWith(aPlanReplyText({ days }));
  const generated = await generatePlan(ready);
  if (generated.statusCode !== 201) throw new Error(`Generating the Plan failed with ${generated.statusCode}`);
  return { ...ready, plan: generated.json() as SavedPlan };
}

export function sendChat(ready: Ready, message: string, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/chat`, cookies, payload: { message } });
}

export function readChat(ready: Ready, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/chat`, cookies });
}

export function acceptChange(ready: Ready, messageId: string, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/chat/${messageId}/accept`, cookies });
}

export function rejectChange(ready: Ready, messageId: string, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/chat/${messageId}/reject`, cookies });
}

export const messagesOf = (response: { json(): unknown }): ChatMessage[] => (response.json() as { messages: ChatMessage[] }).messages;

/** The Activity that has this title anywhere in the Plan. */
export function findActivity(plan: SavedPlan, title: string): PlanActivity | undefined {
  return plan.days.flatMap((day) => day.activities).find((activity) => activity.title === title);
}

export const activitiesOnDay = (plan: SavedPlan, dayNumber: number): PlanActivity[] =>
  [...(plan.days.find((day) => day.dayNumber === dayNumber)?.activities ?? [])];
