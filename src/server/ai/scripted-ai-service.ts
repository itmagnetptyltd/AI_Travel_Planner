import { parseCommentLine } from '../feedback/feedback-analysis-prompt';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { AiUnavailableError, type AiReply, type AiService } from './ai-service';

/**
 * A stand-in for the AI, for the browser tests only: a real server cannot have its provider replaced
 * from inside a test, so the test writes what the next request should do into a file. The file is read
 * on every request, so a test can change its mind between clicks. Config refuses this in production.
 */
const scriptSchema = z.object({
  mode: z.enum(['ok', 'error', 'hang']).default('ok'),
  dayCount: z.number().int().min(1).max(14).default(8),
  /** Put in front of every Activity title, so a test can tell one generated Plan from another. */
  label: z.string().max(60).optional(),
  /** What a chat message gets back. `echoInstructions` answers with the instructions the AI was sent, as a misbehaving AI might. */
  chat: z
    .object({ reply: z.string().max(2000), changes: z.array(z.unknown()).nullish(), echoInstructions: z.boolean().optional() })
    .optional(),
  /** What an Administrator's request to analyse feedback gets back: a summary, and themes named for the entries whose comment holds a word. */
  feedback: z
    .object({
      summary: z.string().max(2000).optional(),
      themes: z.array(z.object({ name: z.string().max(120), matching: z.string().max(60) })).max(20).optional(),
    })
    .optional(),
});

type Script = z.infer<typeof scriptSchema>;

function readScript(file: string): Script {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return scriptSchema.parse({});
  }
  try {
    return scriptSchema.parse(JSON.parse(raw));
  } catch {
    throw new AiUnavailableError('The AI script file is not valid.');
  }
}

const ACTIVITIES = [
  { title: 'Morning temple visit', startTime: '09:00', category: 'Activities', estimatedCost: 10 },
  { title: 'Lunch at a local noodle bar', startTime: '12:30', category: 'Food', estimatedCost: 15 },
  { title: 'Evening stroll through the old town', startTime: '18:00', category: 'Activities', estimatedCost: 0 },
] as const;

const SUGGESTION = { title: 'Tea ceremony at a quiet garden', startTime: '09:00', category: 'Activities', estimatedCost: 30 } as const;

const labelled = (title: string, label: string | undefined): string => (label ? `${label}: ${title}` : title);

function activitiesFor(dayNumber: number, label: string | undefined) {
  return ACTIVITIES.map((activity) => ({
    ...activity,
    title: labelled(activity.title, label),
    durationMinutes: 90,
    location: 'City centre',
    reason: `A well-loved way to spend part of day ${dayNumber}.`,
  }));
}

function planText(dayCount: number, label: string | undefined): string {
  const days = Array.from({ length: dayCount }, (_, index) => ({ dayNumber: index + 1, activities: activitiesFor(index + 1, label) }));
  return JSON.stringify({ days, stay: { accommodationType: 'Hotel', suggestedArea: 'City centre', nightlyCostEstimate: 150 } });
}

const dayText = (dayNumber: number, label: string | undefined): string =>
  JSON.stringify({ dayNumber, activities: activitiesFor(dayNumber, label) });

const suggestionText = (label: string | undefined): string =>
  JSON.stringify({
    activity: {
      ...SUGGESTION,
      title: labelled(SUGGESTION.title, label),
      durationMinutes: 60,
      location: 'A quiet garden',
      reason: 'A calm start that suits the morning.',
    },
  });

const DEFAULT_CHAT_REPLY = 'I can help with your trip.';

function chatText(system: string, script: Script): string {
  const chat = script.chat ?? { reply: DEFAULT_CHAT_REPLY };
  return JSON.stringify({ reply: chat.echoInstructions ? system.slice(0, 1900) : chat.reply, changes: chat.changes ?? null });
}

const DEFAULT_FEEDBACK_SUMMARY = 'Travelers gave a mix of praise and complaints.';

function themesText(user: string, script: Script): string {
  const listed = user.split('\n').flatMap((line) => parseCommentLine(line) ?? []);
  const themes = (script.feedback?.themes ?? []).map((theme) => ({
    name: theme.name,
    entries: listed.filter(({ comment }) => comment.toLowerCase().includes(theme.matching.toLowerCase())).map(({ number }) => number),
  }));
  return JSON.stringify({ themes });
}

/** Which request this is, told by how it begins: a chat message, feedback to analyse, one Day, one replacement Activity, or a whole Plan. */
function replyTextFor(request: { readonly system: string; readonly user: string }, script: Script): string {
  const { user } = request;
  if (user.startsWith('Chat about this trip.')) return chatText(request.system, script);
  if (user.startsWith('Summarise this feedback.')) return script.feedback?.summary ?? DEFAULT_FEEDBACK_SUMMARY;
  if (user.startsWith('Find the recurring themes in this feedback.')) return themesText(user, script);
  const day = /^Rewrite Day (\d+) of this trip/.exec(user);
  if (day?.[1]) return dayText(Number(day[1]), script.label);
  if (user.startsWith('Suggest one activity to replace')) return suggestionText(script.label);
  return planText(script.dayCount, script.label);
}

const PIECE_CHARS = 24;
const PIECE_DELAY_MS = 15;

/** Hands `text` over a few characters at a time, as a provider that streams would, so the browser tests exercise the streamed path. */
async function writeInPieces(text: string, onText: (delta: string) => void, signal: AbortSignal): Promise<void> {
  for (let start = 0; start < text.length; start += PIECE_CHARS) {
    if (signal.aborted) throw new AiUnavailableError('The scripted AI was cut off.');
    onText(text.slice(start, start + PIECE_CHARS));
    await new Promise((resolve) => setTimeout(resolve, PIECE_DELAY_MS));
  }
}

export function createScriptedAiService(scriptFile: string): AiService {
  return {
    async complete(request): Promise<AiReply> {
      const script = readScript(scriptFile);
      if (script.mode === 'error') throw new AiUnavailableError('The scripted AI was told to fail.');
      if (script.mode === 'hang') {
        return new Promise<AiReply>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new AiUnavailableError('The scripted AI never answered.')));
        });
      }
      const text = replyTextFor(request, script);
      if (request.onText) await writeInPieces(text, request.onText, request.signal);
      return { text, inputTokens: 500, outputTokens: 1_500 };
    },
  };
}
