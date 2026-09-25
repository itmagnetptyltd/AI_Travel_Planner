import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AiUnavailableError } from '../../src/server/ai/ai-service';
import { createScriptedAiService } from '../../src/server/ai/scripted-ai-service';
import { buildActivityPrompt, buildDayPrompt } from '../../src/server/plans/plan-prompt';
import { parseActivityReply, parseDayReply, parsePlanReply } from '../../src/server/plans/plan-reply';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function aScriptFile(contents?: object): string {
  const directory = mkdtempSync(join(tmpdir(), 'scripted-ai-'));
  directories.push(directory);
  const file = join(directory, 'script.json');
  if (contents) writeFileSync(file, JSON.stringify(contents));
  return file;
}

const request = (signal = new AbortController().signal) => ({ system: 's', user: 'u', maxOutputTokens: 100, signal });
const TRIP = { startDate: '2026-10-10', dayCount: 8, currency: 'USD', adults: 2, children: 0, budget: 3000 } as const;

describe('the scripted AI service used by the browser tests', () => {
  // @covers REQ-TRV-026@v1
  test('answers with a usable 8-Day Plan when there is no script file', async () => {
    const reply = await createScriptedAiService(aScriptFile()).complete(request());

    expect(parsePlanReply(reply.text, TRIP).ok).toBe(true);
  });

  // @covers REQ-TRV-026@v1
  test('answers with as many Days as the script asks for', async () => {
    const reply = await createScriptedAiService(aScriptFile({ mode: 'ok', dayCount: 3 })).complete(request());

    expect(parsePlanReply(reply.text, { ...TRIP, dayCount: 3 }).ok).toBe(true);
    expect(parsePlanReply(reply.text, TRIP).ok).toBe(false);
  });

  // @covers REQ-TRV-029@v2
  test('fails as the AI being unavailable when the script says error', async () => {
    const service = createScriptedAiService(aScriptFile({ mode: 'error' }));

    await expect(service.complete(request())).rejects.toBeInstanceOf(AiUnavailableError);
  });

  // @covers REQ-TRV-030@v2
  test('never answers when the script says hang, until the caller gives up', async () => {
    const service = createScriptedAiService(aScriptFile({ mode: 'hang' }));
    const controller = new AbortController();

    const pending = service.complete(request(controller.signal));
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AiUnavailableError);
  });

  // @covers REQ-TRV-026@v1
  test('follows the script as it changes between requests', async () => {
    const file = aScriptFile({ mode: 'error' });
    const service = createScriptedAiService(file);
    await expect(service.complete(request())).rejects.toBeInstanceOf(AiUnavailableError);

    writeFileSync(file, JSON.stringify({ mode: 'ok' }));

    expect((await service.complete(request())).text).toContain('"days"');
  });

  // @covers REQ-TRV-029@v2
  test('fails as the AI being unavailable when the script file is not valid', async () => {
    const file = aScriptFile();
    writeFileSync(file, 'not json');

    await expect(createScriptedAiService(file).complete(request())).rejects.toBeInstanceOf(AiUnavailableError);
  });

  // @covers REQ-TRV-018@v1
  test('puts the label from the script in front of every Activity title, so one Plan tells apart from another', async () => {
    const reply = await createScriptedAiService(aScriptFile({ mode: 'ok', dayCount: 2, label: 'First idea' })).complete(request());

    const result = parsePlanReply(reply.text, { ...TRIP, dayCount: 2 });

    if (!result.ok) throw new Error(`Expected a Plan, got ${result.problem}`);
    const titles = result.plan.days.flatMap((day) => day.activities.map((activity) => activity.title));
    expect(titles).toHaveLength(6);
    expect(titles.every((title) => title.startsWith('First idea: '))).toBe(true);
  });
});

describe('the scripted AI answering the smaller requests the browser tests make', () => {
  const trip = { dayCount: 8, startDate: '2026-10-10', endDate: '2026-10-17', adults: 2, children: 2, budget: 5000, currency: 'USD' as const, destinationTextMaxChars: 2000 };
  const input = {
    ...trip,
    destination: { name: 'Kyoto', country: 'Japan', description: 'd', popularActivities: 'p', travelInformation: 't' },
    preferences: { travelStyles: [], interests: [], foodPreferences: [], transportation: [], accommodation: null },
  };

  // @covers REQ-TRV-042@v1
  test('answers a request to rewrite Day 4 with Day 4, labelled from the script', async () => {
    const { system, user } = buildDayPrompt(input, { dayNumber: 4, date: '2026-10-13' });

    const reply = await createScriptedAiService(aScriptFile({ mode: 'ok', label: 'Second idea' })).complete({ ...request(), system, user });

    const parsed = parseDayReply(reply.text, 4);
    if (!parsed.ok) throw new Error(parsed.problem);
    expect(parsed.activities).toHaveLength(3);
    expect(parsed.activities.every((activity) => activity.title.startsWith('Second idea: '))).toBe(true);
  });

  // @covers REQ-TRV-047@v1
  test('answers a request for a replacement Activity with one Activity, labelled from the script', async () => {
    const { system, user } = buildActivityPrompt(input, { dayNumber: 1, date: '2026-10-10', title: 'Morning temple visit', startTime: '09:00' });

    const reply = await createScriptedAiService(aScriptFile({ mode: 'ok', label: 'Suggested' })).complete({ ...request(), system, user });

    const parsed = parseActivityReply(reply.text);
    if (!parsed.ok) throw new Error(parsed.problem);
    expect(parsed.activity.title).toBe('Suggested: Tea ceremony at a quiet garden');
    expect(parsed.activity.startTime).toBe('09:00');
  });

  // @covers REQ-TRV-102@v1
  test('fails a request to rewrite a Day, and a request for an Activity, when the script says error', async () => {
    const service = createScriptedAiService(aScriptFile({ mode: 'error' }));
    const day = buildDayPrompt(input, { dayNumber: 2, date: '2026-10-11' });
    const activity = buildActivityPrompt(input, { dayNumber: 1, date: '2026-10-10', title: 'x', startTime: '09:00' });

    await expect(service.complete({ ...request(), ...day })).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(service.complete({ ...request(), ...activity })).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
