import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AiUnavailableError } from '../../src/server/ai/ai-service';
import { createScriptedAiService } from '../../src/server/ai/scripted-ai-service';
import { parsePlanReply } from '../../src/server/plans/plan-reply';

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
const TRIP = { startDate: '2026-10-10', dayCount: 8, currency: 'USD' } as const;

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
});
