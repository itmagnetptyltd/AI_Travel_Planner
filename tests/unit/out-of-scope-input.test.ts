import { describe, expect, it } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import { buildChatPrompt } from '../../src/server/chat/chat-prompt';
import { buildActivityPrompt, buildDayPrompt, buildPlanPrompt, type PlanPromptInput } from '../../src/server/plans/plan-prompt';
import { regenerationRequestSchema } from '../../src/server/plans/plan-routes';
import { chatMessageRequestSchema } from '../../src/shared/chat-schemas';
import { profileUpdateSchema } from '../../src/shared/profile-schemas';
import { tripInputSchema } from '../../src/shared/trip-schemas';
import { aChatReplyText, aTravelerWithAShoppingPlan, sendChat } from '../support/a-chat';
import { allEvents, listening, openChatStream } from '../support/a-chat-stream';
import { aTravelerWithATrip, currentPlan } from '../support/a-saved-plan-journey';
import { aTripInput } from '../support/a-trip';
import { A_FULL_PLAN, controlsIn, countOf, everyPlanningView, shownIn, type ViewName } from '../support/out-of-scope';
import { IN_ANOTHER_LANGUAGE, LANGUAGE, VOICE } from '../support/out-of-scope-words';
import { sourceFilesUnder } from '../support/service-layer-boundaries';

const views = everyPlanningView();

const SPEECH_AND_MEDIA_APIS = /\b(SpeechRecognition|webkitSpeechRecognition|speechSynthesis|SpeechSynthesisUtterance|getUserMedia|MediaRecorder|AudioContext|createMediaStreamSource|RTCPeerConnection)\b|<audio\b|type="file"|accept="audio|capture="/;

/** The names of the fields an object schema accepts. Every schema that takes what a Traveler sends is strict, so nothing else gets in. */
const fieldsOf = (schema: unknown): string[] => Object.keys((schema as { shape: Record<string, unknown> }).shape).sort();

const PROMPT_INPUT: PlanPromptInput = {
  destination: { name: 'Kyoto', country: 'Japan', description: 'Temples and gardens.', popularActivities: 'Fushimi Inari', travelInformation: 'Near Osaka.' },
  startDate: '2026-10-10',
  endDate: '2026-10-12',
  dayCount: 3,
  adults: 2,
  children: 0,
  budget: 3000,
  currency: 'USD',
  preferences: { travelStyles: ['Relaxed'], interests: ['Food'], foodPreferences: [], transportation: [], accommodation: null },
  destinationTextMaxChars: 2_000,
};

describe('asking for a Plan', () => {
  // @covers REQ-TRV-086@v1
  it.each<ViewName>(['trip form', 'plan generator', 'trip preferences', 'chat'])('offers no choice of language in the %s', (name) => {
    expect(shownIn(views[name])).not.toMatch(LANGUAGE);
  });

  // @covers REQ-TRV-086@v1
  it.each<ViewName>(['plan generator', 'trip preferences', 'chat'])('has no drop-down list at all in the %s, where a language could be chosen', (name) => {
    expect(countOf(views[name], ['select'])).toBe(0);
  });

  // @covers REQ-TRV-086@v1
  it('gives every choice on the Trip form a name that is not a language', () => {
    const choices = [...views['trip form'].matchAll(/<(?:label|legend)\b[^>]*>([\s\S]*?)<\/(?:label|legend)>/g)].map((match) => (match[1] ?? '').replace(/<[^>]*>/g, ' ').trim());

    expect(choices.length).toBeGreaterThan(5);
    for (const choice of choices) expect(choice).not.toMatch(LANGUAGE);
  });

  // @covers REQ-TRV-086@v1
  it('has no field for a language on a Trip, on a Traveler’s profile or in a request for a Plan: exactly these fields, whatever they are called', () => {
    expect(fieldsOf(tripInputSchema)).toEqual([
      'accommodation', 'adults', 'budget', 'children', 'currency', 'destinationId', 'endDate', 'foodPreferences', 'interests', 'name', 'numberOfTravelers', 'startDate', 'transportation', 'travelStyles',
    ]);
    expect(fieldsOf(profileUpdateSchema)).toEqual(['defaultTravelStyle', 'displayName', 'foodPreference', 'notifications', 'preferredCurrency']);
    expect(fieldsOf(regenerationRequestSchema)).toEqual(['confirmReplaceEdits']);
  });

  // @covers REQ-TRV-086@v1
  it('refuses a language sent with a Trip or a profile, under any name', () => {
    const trip = aTripInput('a-destination');

    expect(tripInputSchema.safeParse(trip).success).toBe(true);
    for (const field of ['language', 'locale', 'preferredLanguage', 'lang', 'outputLanguage']) {
      expect(tripInputSchema.safeParse({ ...trip, [field]: 'fr' }).success).toBe(false);
      expect(profileUpdateSchema.safeParse({ [field]: 'fr' }).success).toBe(false);
    }
  });

  // @covers REQ-TRV-086@v1
  it('tells the AI nothing about a language in any request it makes for a Plan, a Day, an Activity or a chat message', () => {
    const activity = A_FULL_PLAN.days[0]?.activities[0];
    const prompts = [
      buildPlanPrompt(PROMPT_INPUT),
      buildDayPrompt(PROMPT_INPUT, { dayNumber: 2, date: '2026-10-11' }),
      buildActivityPrompt(PROMPT_INPUT, { dayNumber: 1, date: '2026-10-10', title: activity?.title ?? '', startTime: activity?.startTime ?? '09:00' }),
      buildChatPrompt({ trip: PROMPT_INPUT, plan: A_FULL_PLAN, history: [], message: 'What should I see?' }),
    ];

    for (const prompt of prompts) expect(requestTextOf(prompt)).not.toMatch(IN_ANOTHER_LANGUAGE);
  });

  // @covers REQ-TRV-086@v1
  it('refuses a request for a Plan that names a language, leaves the Trip without a Plan, and does not ask the AI', async () => {
    const ready = await aTravelerWithATrip();
    const post = (payload: object) => ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/plan`, cookies: ready.cookies, payload });

    const refused = await Promise.all([{ language: 'French' }, { locale: 'fr-FR' }, { outputLanguage: 'fr', confirmReplaceEdits: true }].map(post));

    expect(refused.map((response) => response.statusCode)).toEqual([400, 400, 400]);
    expect(ready.testApp.ai.requests).toHaveLength(0);
    expect((await currentPlan(ready)).statusCode).toBe(404);
  });

  // @covers REQ-TRV-086@v1
  it('still generates a Plan when no language is named', async () => {
    const ready = await aTravelerWithATrip();

    const response = await ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/plan`, cookies: ready.cookies });

    expect(response.statusCode).toBe(201);
  });
});

describe('the chat', () => {
  // @covers REQ-TRV-087@v1
  it('is one text box and a Send button, with nothing to speak into, record with or attach', () => {
    const chat = views.chat;

    expect(countOf(chat, ['textarea'])).toBe(1);
    expect(countOf(chat, ['audio', 'video', 'canvas'])).toBe(0);
    expect(chat).not.toMatch(/<input\b[^>]*type="(file|audio|image)"/);
    expect(controlsIn(chat).map((control) => control.name)).toContain('Send');
    expect(shownIn(chat)).not.toMatch(VOICE);
  });

  // @covers REQ-TRV-087@v1
  it('uses no speech, microphone or recording feature of the browser anywhere', () => {
    const using = sourceFilesUnder('.', 'src/web').filter((file) => SPEECH_AND_MEDIA_APIS.test(file.content)).map((file) => file.path);

    expect(using).toEqual([]);
  });

  // @covers REQ-TRV-087@v1
  it('takes a message as exactly one field, of text', () => {
    expect(fieldsOf(chatMessageRequestSchema)).toEqual(['message']);
    expect(chatMessageRequestSchema.safeParse({ message: 'hello' }).success).toBe(true);
    expect(chatMessageRequestSchema.safeParse({ message: 'hello', audio: 'UklGRg==' }).success).toBe(false);
    expect(chatMessageRequestSchema.safeParse({ message: { audio: 'UklGRg==' } }).success).toBe(false);
  });

  // @covers REQ-TRV-087@v1
  it('accepts only a typed message: a field for sound, or a message that is not text, is refused and the AI is not asked', async () => {
    const ready = await aTravelerWithAShoppingPlan();
    ready.testApp.ai.replyWith(aChatReplyText('ok'));
    const asked = ready.testApp.ai.requests.length;
    const post = (payload: object) => ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/chat`, cookies: ready.cookies, payload });

    const withSound = await post({ message: 'hello', audio: 'UklGRg==', transcript: 'hello' });
    const notText = await post({ message: { audio: 'UklGRg==' } });

    expect([withSound.statusCode, notText.statusCode]).toEqual([400, 400]);
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-087@v1
  it('does not take a recording or an upload as the message either, on the ordinary route or the streaming one, and the AI is not asked', async () => {
    const ready = await aTravelerWithAShoppingPlan();
    const asked = ready.testApp.ai.requests.length;
    const send = (url: string, contentType: string) =>
      ready.testApp.app.inject({ method: 'POST', url, cookies: ready.cookies, headers: { 'content-type': contentType }, payload: Buffer.from('RIFF....WEBM') });

    for (const url of [`/api/trips/${ready.tripId}/chat`, `/api/trips/${ready.tripId}/chat/stream`]) {
      for (const contentType of ['audio/webm', 'audio/wav', 'multipart/form-data; boundary=xyz', 'application/octet-stream']) {
        // Refused, though not yet with a 4xx of its own: the application's error handler answers any error it does not know with 500.
        expect((await send(url, contentType)).statusCode).toBeGreaterThanOrEqual(400);
      }
    }
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-087@v1
  it('still answers a typed message, on the ordinary route and on the streaming one', async () => {
    const ready = await aTravelerWithAShoppingPlan();
    ready.testApp.ai.replyWith(aChatReplyText('Kyoto is lovely.'));
    const baseUrl = await listening(ready.testApp);

    const ordinary = await sendChat(ready, 'When should I go?');
    const { response, events } = await openChatStream(baseUrl, ready, 'And what should I eat?');
    const seen = await allEvents(events);

    expect(ordinary.statusCode).toBe(201);
    expect(response.status).toBe(200);
    expect(seen.at(-1)?.type).toBe('done');
  });
});
