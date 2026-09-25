import { describe, expect, it } from 'vitest';
import { parseChatStreamLine, type ChatStreamEvent } from '../../src/shared/chat-stream';
import { endingOf, foldStreamEvent, NOTHING_STREAMED, splitLines } from '../../src/web/components/chat-stream';

const MESSAGES = [
  { id: 'm1', role: 'traveler', text: 'hello', createdAt: '2026-09-23T09:00:00.000Z' },
  { id: 'm2', role: 'assistant', text: 'Hello there', createdAt: '2026-09-23T09:00:01.000Z' },
];

describe('the lines of a chat reply as they arrive from the server', () => {
  // @covers REQ-TRV-080@v1
  it('are cut at line ends, keeping a line that has only half arrived until the rest does', () => {
    const first = splitLines('', '{"type":"text","text":"Hel');
    expect(first).toEqual({ lines: [], pending: '{"type":"text","text":"Hel' });

    const second = splitLines(first.pending, 'lo"}\n{"type":"text","text":"there"}\n{"type":"do');
    expect(second).toEqual({ lines: ['{"type":"text","text":"Hello"}', '{"type":"text","text":"there"}'], pending: '{"type":"do' });
  });

  // @covers REQ-TRV-080@v1
  it('ignore blank lines, and handle a chunk that holds several lines at once', () => {
    expect(splitLines('', '\n\n{"a":1}\n\n{"b":2}\n')).toEqual({ lines: ['{"a":1}', '{"b":2}'], pending: '' });
  });
});

describe('one line of the reply, read', () => {
  // @covers REQ-TRV-080@v1
  it.each<[string, ChatStreamEvent]>([
    ['{"type":"text","text":"Hello "}', { type: 'text', text: 'Hello ' }],
    ['{"type":"failed","code":"AI_UNAVAILABLE","message":"Try again."}', { type: 'failed', code: 'AI_UNAVAILABLE', message: 'Try again.' }],
  ])('turns %s into an event', (line, expected) => {
    expect(parseChatStreamLine(line)).toEqual(expected);
  });

  // @covers REQ-TRV-080@v1
  it('turns the last line into the saved messages', () => {
    expect(parseChatStreamLine(JSON.stringify({ type: 'done', messages: MESSAGES }))).toMatchObject({ type: 'done', messages: [{ id: 'm1' }, { id: 'm2' }] });
  });

  // @covers REQ-TRV-080@v1
  it.each(['not json', '{"type":"unknown"}', '{"type":"text"}', '{"type":"text","text":5}', '{"type":"done","messages":"none"}', 'null', '[]'])(
    'gives nothing for %s, so a line that is not one of ours is never shown',
    (line) => {
      expect(parseChatStreamLine(line)).toBeNull();
    },
  );
});

describe('what is on show as a reply arrives', () => {
  // @covers REQ-TRV-080@v1
  it('grows by each piece of text, in order', () => {
    const shown = ['Hello ', 'there, ', 'traveler'].reduce((state, text) => foldStreamEvent(state, { type: 'text', text }), NOTHING_STREAMED);

    expect(shown).toEqual({ text: 'Hello there, traveler', outcome: null });
  });

  // @covers REQ-TRV-080@v1
  it('is replaced by the saved messages when the reply is done, and no longer holds the text', () => {
    const growing = foldStreamEvent(NOTHING_STREAMED, { type: 'text', text: 'Hello there' });

    const done = foldStreamEvent(growing, { type: 'done', messages: [MESSAGES[0], MESSAGES[1]] as never });

    expect(done.text).toBe('');
    expect(done.outcome).toMatchObject({ kind: 'done' });
  });

  // @covers REQ-TRV-080@v1
  it('is cleared, and says why, when the reply failed part way, so half a reply is never left on show', () => {
    const growing = foldStreamEvent(NOTHING_STREAMED, { type: 'text', text: 'Hello there, trav' });

    const failed = foldStreamEvent(growing, { type: 'failed', code: 'AI_UNAVAILABLE', message: 'The AI is unavailable.' });

    expect(failed).toEqual({ text: '', outcome: { kind: 'failed', code: 'AI_UNAVAILABLE', message: 'The AI is unavailable.' } });
  });

  // @covers REQ-TRV-080@v1
  it('takes no notice of anything that arrives after the reply has ended', () => {
    const failed = foldStreamEvent(NOTHING_STREAMED, { type: 'failed', code: 'AI_UNAVAILABLE', message: 'The AI is unavailable.' });

    expect(foldStreamEvent(failed, { type: 'text', text: 'late' })).toBe(failed);
  });
});

describe('how a streamed chat message ended, as the Traveler is told', () => {
  // @covers REQ-TRV-080@v1
  it('is the saved messages when the reply was done', () => {
    const done = foldStreamEvent(NOTHING_STREAMED, { type: 'done', messages: [MESSAGES[0], MESSAGES[1]] as never });

    expect(endingOf({ ok: true }, done)).toMatchObject({ kind: 'done', messages: [{ id: 'm1' }, { id: 'm2' }] });
  });

  // @covers REQ-TRV-080@v1
  it('is the server’s own words when it refused the message before anything streamed, and the chat is not read again', () => {
    const error = { code: 'CHAT_LIMIT_REACHED', message: 'You have reached today’s limit.' };

    expect(endingOf({ ok: false, status: 429, error }, NOTHING_STREAMED)).toEqual({ kind: 'problem', error, shouldReloadChat: false });
  });

  // @covers REQ-TRV-080@v1
  it('is the fixed failure when the AI broke part way, and the chat is not read again', () => {
    const failed = foldStreamEvent(NOTHING_STREAMED, { type: 'failed', code: 'AI_UNAVAILABLE', message: 'The AI is unavailable.' });

    expect(endingOf({ ok: true }, failed)).toEqual({ kind: 'problem', error: { code: 'AI_UNAVAILABLE', message: 'The AI is unavailable.' }, shouldReloadChat: false });
  });

  // @covers REQ-TRV-080@v1
  it('says the connection was lost, and that the chat should be read again, when no ending arrived, since the server saves the exchange anyway', () => {
    const half = foldStreamEvent(NOTHING_STREAMED, { type: 'text', text: 'Hello there, trav' });

    const ending = endingOf({ ok: true }, half);

    expect(ending).toMatchObject({ kind: 'problem', shouldReloadChat: true });
    expect(ending.kind === 'problem' && ending.error.message).toMatch(/connection was lost.*check the chat before sending again/i);
  });
});
