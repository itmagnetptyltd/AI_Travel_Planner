import { z } from 'zod';
import { CHAT_DECLINE_MESSAGE, CHAT_REPLY_MAX_CHARS } from '../../shared/chat-schemas';
import { activitySchema, jsonIn } from '../plans/plan-reply';
import type { ChangedDay } from './chat-proposal';

export type ChatReplyProblem = 'not-json' | 'invalid';

export type ChatReplyResult =
  | { readonly ok: true; readonly reply: string; readonly changes: readonly ChangedDay[] }
  | { readonly ok: false; readonly problem: ChatReplyProblem };

/** A Trip is at most 14 Days long, and a Day this long is already more than anyone will read. */
const MAX_CHANGED_DAYS = 14;
const MAX_ACTIVITIES_PER_DAY = 30;

const changeSchema = z.object({
  dayNumber: z.number().int().min(1),
  activities: z.array(activitySchema).min(1).max(MAX_ACTIVITIES_PER_DAY),
});

const replySchema = z.object({
  reply: z.string().trim().min(1).max(CHAT_REPLY_MAX_CHARS),
  changes: z.array(changeSchema).max(MAX_CHANGED_DAYS).nullish(),
});

/** A run this many words long, copied from the instructions, is treated as giving them away. */
const REVEAL_WINDOW_WORDS = 8;

const wordsOf = (text: string): string[] => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

const runsOf = (words: readonly string[]): Set<string> => {
  const runs = new Set<string>();
  for (let start = 0; start + REVEAL_WINDOW_WORDS <= words.length; start += 1) {
    runs.add(words.slice(start, start + REVEAL_WINDOW_WORDS).join(' '));
  }
  return runs;
};

/** Whether `reply` repeats a run of words from `instructions`, whatever its capitals and punctuation (REQ-TRV-040). */
export function revealsInstructions(reply: string, instructions: string): boolean {
  const given = runsOf(wordsOf(instructions));
  return [...runsOf(wordsOf(reply))].some((run) => given.has(run));
}

/** Every piece of text in a reply, whether it is said to the Traveler or written into an Activity they would see. */
const textsIn = (reply: string, changes: readonly ChangedDay[]): string[] => [
  reply,
  ...changes.flatMap((change) => change.activities.flatMap((activity) => [activity.title, activity.location, activity.reason ?? ''])),
];

/**
 * Turns the AI's reply into text and the Days it would change. The reply is untrusted: it is refused,
 * never repaired, when it is not what was asked for, and a reply that gives away the instructions is
 * replaced by the polite decline, with any change it carried dropped.
 */
export function parseChatReply(text: string, context: { readonly instructions: string }): ChatReplyResult {
  const raw = jsonIn(text);
  if (raw === undefined) return { ok: false, problem: 'not-json' };
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problem: 'invalid' };
  const changes = parsed.data.changes ?? [];
  const days = changes.map((change) => change.dayNumber);
  if (new Set(days).size !== days.length) return { ok: false, problem: 'invalid' };
  if (textsIn(parsed.data.reply, changes).some((text) => revealsInstructions(text, context.instructions))) {
    return { ok: true, reply: CHAT_DECLINE_MESSAGE, changes: [] };
  }
  return { ok: true, reply: parsed.data.reply, changes };
}
