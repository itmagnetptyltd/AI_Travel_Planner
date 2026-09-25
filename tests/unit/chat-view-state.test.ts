import { describe, expect, test } from 'vitest';
import {
  chatProblem,
  decisionLabel,
  mergeMessages,
  proposalIsOutOfDate,
  proposalLines,
  replaceMessage,
  roleLabel,
  suggestedChangeHeading,
} from '../../src/web/components/chat-view-state';
import { CHAT_LIMIT_REACHED, PROPOSAL_STALE, type ChatMessage, type ProposedDay } from '../../src/shared/chat-schemas';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE } from '../../src/shared/plan-schemas';

const activity = (id: string, title: string, startTime: string) => ({
  id,
  title,
  startTime,
  durationMinutes: 60,
  estimatedCost: 10,
  location: 'Gion',
  reason: 'Because.',
  category: 'Activities' as const,
  changedByHand: false,
});

const DAY: ProposedDay = {
  dayNumber: 3,
  date: '2026-10-12',
  activities: [
    { ...activity('a', 'Temple walk', '09:00'), mark: 'unchanged' },
    { ...activity('b', 'Sushi class', '16:00'), mark: 'added' },
    { ...activity('c', 'Tea ceremony', '11:00'), mark: 'altered' },
  ],
  removed: [activity('d', 'Shopping at Nishiki market', '15:00')],
};

describe('showing what a chat change would do', () => {
  // @covers REQ-TRV-038@v1
  test('marks the removed Activity as removed and the added Activity as added', () => {
    const lines = proposalLines(DAY);

    expect(lines.find((line) => line.text.includes('Shopping at Nishiki market'))?.label).toBe('Removed');
    expect(lines.find((line) => line.text.includes('Sushi class'))?.label).toBe('Added');
  });

  // @covers REQ-TRV-038@v1
  test('marks an altered Activity as changed, and one that is not touched as unchanged', () => {
    const lines = proposalLines(DAY);

    expect(lines.find((line) => line.text.includes('Tea ceremony'))?.label).toBe('Changed');
    expect(lines.find((line) => line.text.includes('Temple walk'))?.label).toBe('Unchanged');
  });

  // @covers REQ-TRV-038@v1
  test('gives every line its time and title, the Day Activities in order first and the removed ones after them', () => {
    const lines = proposalLines(DAY);

    expect(lines.map((line) => line.text)).toEqual([
      '09:00 Temple walk',
      '16:00 Sushi class',
      '11:00 Tea ceremony',
      '15:00 Shopping at Nishiki market',
    ]);
    expect(new Set(lines.map((line) => line.key)).size).toBe(4);
  });
});

describe('what the chat tells the Traveler when something goes wrong', () => {
  // @covers REQ-TRV-104@v1
  test('says the AI is unavailable when the AI could not answer', () => {
    expect(chatProblem({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE })).toMatch(/unavailable/i);
  });

  // @covers REQ-TRV-104@v1
  test('says so even when the server sent no words', () => {
    expect(chatProblem({ code: AI_UNAVAILABLE })).toMatch(/AI planner is unavailable/i);
  });

  // @covers REQ-TRV-035@v1
  test('passes on the server message that says when the daily limit resets', () => {
    const message = "You have reached today's limit of 100 chat messages. It resets at 2026-09-24 00:00 UTC.";

    expect(chatProblem({ code: CHAT_LIMIT_REACHED, message })).toBe(message);
  });

  // @covers REQ-TRV-037@v1
  test('tells the Traveler to ask again when a suggestion has gone stale', () => {
    expect(chatProblem({ code: PROPOSAL_STALE, message: 'The Plan has changed. Ask again.' })).toMatch(/ask again/i);
  });

  test('gives a plain message when the server sends no explanation, and when it cannot be reached', () => {
    expect(chatProblem({ code: 'UNKNOWN' })).toMatch(/try again/i);
    expect(chatProblem({ code: 'NETWORK', message: 'Could not reach the server. Try again.' })).toBe('Could not reach the server. Try again.');
  });
});

describe('the conversation on show', () => {
  const message = (id: string, text: string): ChatMessage => ({ id, role: 'assistant', text, createdAt: '2026-09-25T10:00:00.000Z', proposal: null });

  // @covers REQ-TRV-037@v1
  test('replaces a message that was decided on, keeping the order', () => {
    const before = [message('1', 'one'), message('2', 'two'), message('3', 'three')];

    const after = replaceMessage(before, { ...message('2', 'two'), proposal: { basePlanVersion: 1, status: 'accepted', days: [] } });

    expect(after.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(after[1]?.proposal?.status).toBe('accepted');
    expect(before[1]?.proposal).toBeNull();
  });

  // @covers REQ-TRV-037@v1
  test('says a change was accepted or rejected, and nothing while it is waiting', () => {
    expect(decisionLabel('accepted')).toBe('Accepted');
    expect(decisionLabel('rejected')).toBe('Rejected');
    expect(decisionLabel('pending')).toBeNull();
  });

  // @covers REQ-TRV-035@v1
  test('names who said each message', () => {
    expect(roleLabel('traveler')).toBe('You');
    expect(roleLabel('assistant')).toBe('AI');
  });
});

describe('keeping the conversation on show right', () => {
  const said = (id: string, text: string): ChatMessage => ({ id, role: 'traveler', text, createdAt: '2026-09-25T10:00:00.000Z', proposal: null });

  // @covers REQ-TRV-035@v1
  test('adds new messages after the ones on show, and never shows one twice', () => {
    const shown = [said('1', 'one'), said('2', 'two')];

    const merged = mergeMessages(shown, [said('2', 'two'), said('3', 'three')]);

    expect(merged.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  // @covers REQ-TRV-035@v1
  test('takes the newer copy of a message that is on show already', () => {
    const merged = mergeMessages([said('1', 'old')], [said('1', 'new')]);

    expect(merged.map((m) => m.text)).toEqual(['new']);
  });

  // @covers REQ-TRV-037@v1
  test.each([
    [3, 3, false],
    [3, 4, true],
  ])('says a suggestion made for Plan version %i is out of date when the Plan is at version %i: %s', (made, now, expected) => {
    expect(proposalIsOutOfDate({ basePlanVersion: made, status: 'pending', days: [] }, now)).toBe(expected);
  });

  // @covers REQ-TRV-037@v1
  test('never calls a suggestion that has been decided on out of date', () => {
    expect(proposalIsOutOfDate({ basePlanVersion: 1, status: 'accepted', days: [] }, 5)).toBe(false);
    expect(proposalIsOutOfDate({ basePlanVersion: 1, status: 'rejected', days: [] }, 5)).toBe(false);
  });

  // @covers REQ-TRV-037@v1
  test('gives the wording for a heading that names the Day without repeating the Plan Day heading', () => {
    expect(suggestedChangeHeading({ dayNumber: 3, date: '2026-10-12', activities: [], removed: [] })).toBe('Suggested change for Day 3');
  });
});

describe('showing what a Changed Activity changed', () => {
  // @covers REQ-TRV-038@v1
  test('gives the duration, cost and place of every Activity, so a change to them is never hidden behind a label', () => {
    const lines = proposalLines(DAY);

    expect(lines.find((line) => line.text.includes('Sushi class'))?.details).toBe('60 min, cost 10, Gion');
    expect(lines.find((line) => line.text.includes('Sushi class'))?.was).toBeNull();
  });

  // @covers REQ-TRV-038@v1
  test('says what an altered Activity was before, so a new cost or place is seen before it is accepted', () => {
    const before = activity('c', 'Tea ceremony', '11:00');
    const day: ProposedDay = {
      dayNumber: 3,
      date: '2026-10-12',
      activities: [{ ...before, estimatedCost: 9999, location: 'Elsewhere', mark: 'altered', previously: before }],
      removed: [],
    };

    const [line] = proposalLines(day);

    expect(line?.label).toBe('Changed');
    expect(line?.details).toBe('60 min, cost 9999, Elsewhere');
    expect(line?.was).toBe('11:00, 60 min, cost 10, Gion');
  });
});
