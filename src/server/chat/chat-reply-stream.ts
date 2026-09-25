import { CHAT_REPLY_MAX_CHARS } from '../../shared/chat-schemas';
import { instructionRuns, repeatsRuns } from './chat-reply';

/**
 * How many finished words are kept back from what is shown. `revealsInstructions` catches a run of 8 words copied from the
 * instructions, so text is only shown once 8 more words have followed it: no word of such a run can be shown before the run is
 * recognised (REQ-TRV-040, REQ-TRV-080).
 */
const HELD_BACK_WORDS = 8;

/** The reply is the first thing in the AI's JSON, as the chat instructions ask; anything else in front of it is not streamed. */
const REPLY_START = /^[^{]*\{\s*"reply"\s*:\s*"/;
/** Text after the opening brace that is not the start of a reply: past this the AI has put something else first. */
const GIVE_UP_AFTER_CHARS = 40;
/** The same words `revealsInstructions` compares: runs of letters and digits, whatever punctuation or symbols lie between them. */
const WORD = /[\p{L}\p{N}]+/gu;

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '"': '"', '\\': '\\' };
const HEX_DIGITS = /^[0-9a-fA-F]{4}$/;

/** Takes what the AI writes a piece at a time and gives back the text of its reply that is safe to show now. */
export interface ReplyStreamer {
  push(delta: string): string;
}

type Phase = 'seeking' | 'reading' | 'ended' | 'stopped';

/**
 * Reads the `reply` text out of the AI's JSON as it is written, decoding its escapes, and releases it a few words behind the
 * writing. It gives nothing when the reply is not first, when the reply has ended, once the text is seen to copy the
 * instructions, or once it is longer than a reply can be saved (which also bounds the work done for each piece). What it releases is always the start of the reply, so nothing shown is ever taken back; the finished reply,
 * checked as a whole, is what is saved.
 */
export function createReplyStreamer(instructions: string): ReplyStreamer {
  const given = instructionRuns(instructions);
  let phase: Phase = 'seeking';
  let beforeReply = '';
  let unfinishedEscape = '';
  let decoded = '';
  let released = 0;

  const hasStopped = (): boolean => phase === 'stopped';

  /** Adds what is in `chunk` to the reply text, up to the closing quote. An escape cut in two waits for its other half. */
  function read(chunk: string): void {
    const text = unfinishedEscape + chunk;
    unfinishedEscape = '';
    let at = 0;
    while (at < text.length) {
      const character = text[at] ?? '';
      if (character === '"') {
        phase = 'ended';
        return;
      }
      if (character !== '\\') {
        decoded += character;
        at += 1;
        continue;
      }
      const next = text[at + 1];
      if (next === undefined || (next === 'u' && at + 6 > text.length)) {
        unfinishedEscape = text.slice(at);
        return;
      }
      if (next === 'u') {
        const hex = text.slice(at + 2, at + 6);
        if (!HEX_DIGITS.test(hex)) {
          phase = 'stopped';
          return;
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        at += 6;
        continue;
      }
      decoded += SIMPLE_ESCAPES[next] ?? next;
      at += 2;
    }
  }

  /** The text before the earliest of the last 8 finished words that has not been given yet. */
  function releasable(): string {
    const finished = [...decoded.matchAll(WORD)].filter((word) => word.index + word[0].length < decoded.length);
    if (finished.length <= HELD_BACK_WORDS) return '';
    const boundary = finished[finished.length - HELD_BACK_WORDS]?.index ?? released;
    const text = decoded.slice(released, boundary);
    released = Math.max(released, boundary);
    return text;
  }

  return {
    push(delta) {
      if (phase === 'ended' || phase === 'stopped') return '';
      if (phase === 'seeking') {
        beforeReply += delta;
        const start = REPLY_START.exec(beforeReply);
        if (!start) {
          const brace = beforeReply.indexOf('{');
          if (brace !== -1 && beforeReply.length - brace > GIVE_UP_AFTER_CHARS) phase = 'stopped';
          return '';
        }
        phase = 'reading';
        read(beforeReply.slice(start[0].length));
        beforeReply = '';
      } else {
        read(delta);
      }
      if (hasStopped()) return '';
      if (decoded.length > CHAT_REPLY_MAX_CHARS || repeatsRuns(decoded, given)) {
        phase = 'stopped';
        return '';
      }
      return releasable();
    },
  };
}
