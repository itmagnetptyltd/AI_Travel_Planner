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

/** Which of the three requests this is, told by how the request begins: a Plan, one Day, or one replacement Activity. */
function replyTextFor(user: string, script: Script): string {
  const day = /^Rewrite Day (\d+) of this trip/.exec(user);
  if (day?.[1]) return dayText(Number(day[1]), script.label);
  if (user.startsWith('Suggest one activity to replace')) return suggestionText(script.label);
  return planText(script.dayCount, script.label);
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
      return { text: replyTextFor(request.user, script), inputTokens: 500, outputTokens: 1_500 };
    },
  };
}
