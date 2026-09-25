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

function planText(dayCount: number, label: string | undefined): string {
  const days = Array.from({ length: dayCount }, (_, index) => ({
    dayNumber: index + 1,
    activities: ACTIVITIES.map((activity) => ({
      ...activity,
      title: label ? `${label}: ${activity.title}` : activity.title,
      durationMinutes: 90,
      location: 'City centre',
      reason: `A well-loved way to spend part of day ${index + 1}.`,
    })),
  }));
  return JSON.stringify({ days, stay: { accommodationType: 'Hotel', suggestedArea: 'City centre', nightlyCostEstimate: 150 } });
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
      return { text: planText(script.dayCount, script.label), inputTokens: 500, outputTokens: 1_500 };
    },
  };
}
