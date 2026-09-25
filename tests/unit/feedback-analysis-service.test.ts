import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accounts, aiRequests, feedback } from '../../src/server/db/schema';
import { FEEDBACK_ANALYSIS_MAX_ENTRIES, FEEDBACK_SUMMARY_MAX_CHARS } from '../../src/shared/feedback-analysis';
import { DOUBLE_INPUT_TOKENS, DOUBLE_OUTPUT_TOKENS } from '../support/an-ai-double';
import { anAnalysisSetup, commentsSentIn, themeOf } from '../support/an-analysis-setup';
import { generationsAlreadyMade } from '../support/an-ai-request';
import { TODAY } from '../support/a-trip';

const NO_FILTER = {};
const SUMMARY = 'Travelers mostly found the schedules too busy.';

const aRequestRecord = (setup: ReturnType<typeof anAnalysisSetup>) => setup.db.select().from(aiRequests).all();

describe('summarising feedback', () => {
  // @covers REQ-TRV-066@v1
  it('shows the Administrator the summary the AI returned', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'The schedule was too busy' });
    setup.ai.replyWith(`  ${SUMMARY}\n`);

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result).toEqual({ ok: true, view: { summary: SUMMARY, commentsAnalysed: 1, commentsAvailable: 1 } });
  });

  // @covers REQ-TRV-066@v1
  it('sends the comments and sends neither the Traveler’s name, email address nor account identifier', async () => {
    const setup = anAnalysisSetup();
    const travelerId = setup.aTraveler();
    setup.db.update(accounts).set({ email: 'traveler@example.com', displayName: 'Jane Citizen' }).where(eq(accounts.id, travelerId)).run();
    const { tripId } = setup.aTripWithAPlan({ owner: travelerId, name: 'Jane Citizen’s honeymoon' });
    setup.feedback.save(travelerId, tripId, { rating: 2, comment: 'The schedule was too busy' });
    setup.ai.replyWith(SUMMARY);

    await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    const [request] = setup.ai.requests;
    const everythingSent = `${request?.system}\n${request?.user}`;
    expect(everythingSent).toContain('The schedule was too busy');
    expect(everythingSent).not.toContain('Jane Citizen');
    expect(everythingSent).not.toContain('traveler@example.com');
    expect(everythingSent).not.toContain(travelerId);
    expect(everythingSent).not.toContain(tripId);
    expect(everythingSent).not.toContain('honeymoon');
  });

  // @covers REQ-TRV-066@v1
  it('does not send an email address the Traveler typed into their own comment', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 3, comment: 'Ask me at traveler@example.com why the days were packed' });
    setup.ai.replyWith(SUMMARY);

    await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    const sent = setup.ai.requests[0]?.user ?? '';
    expect(sent).not.toContain('traveler@example.com');
    expect(sent).toContain('why the days were packed');
  });

  // @covers REQ-TRV-066@v1
  it('sends the rating and Destination with each comment, and leaves out entries with no comment', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 1, comment: 'Far too busy', destination: 'Kyoto' });
    setup.giveFeedback({ rating: 5 });
    setup.ai.replyWith(SUMMARY);

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(setup.ai.requests[0]?.user).toContain('Rating 1 of 5 | Kyoto, Japan | Far too busy');
    expect(commentsSentIn(setup.ai.requests[0]?.user ?? '')).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, view: { commentsAnalysed: 1, commentsAvailable: 1 } });
  });

  // @covers REQ-TRV-066@v1
  it('does not ask the AI, or record a request, when there are no comments to analyse', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 4 });

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result).toEqual({ ok: false, error: 'nothing-to-analyse' });
    expect(setup.ai.requests).toHaveLength(0);
    expect(aRequestRecord(setup)).toHaveLength(0);
  });

  // @covers REQ-TRV-066@v1
  it('analyses only the feedback the filter leaves', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 1, comment: 'the low one' });
    setup.giveFeedback({ rating: 5, comment: 'the high one' });
    setup.ai.replyWith(SUMMARY);

    const result = await setup.analysis.summarise(setup.administratorId, { rating: 1 });

    const sent = commentsSentIn(setup.ai.requests[0]?.user ?? '');
    expect(sent.map(([, comment]) => comment)).toEqual(['the low one']);
    expect(result).toMatchObject({ ok: true, view: { commentsAnalysed: 1, commentsAvailable: 1 } });
  });

  // @covers REQ-TRV-066@v1
  it('sends only the newest comments when there are more than it may send, and says how many there were', async () => {
    const setup = anAnalysisSetup();
    const total = FEEDBACK_ANALYSIS_MAX_ENTRIES + 20;
    for (let index = 0; index < total; index += 1) {
      const { tripId } = setup.giveFeedback({ rating: 3, comment: `zz${String(index).padStart(3, '0')}zz` });
      setup.db.update(feedback).set({ updatedAt: new Date(Date.UTC(2026, 9, 1 + index)) }).where(eq(feedback.tripId, tripId)).run();
    }
    setup.ai.replyWith(SUMMARY);

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    const sent = commentsSentIn(setup.ai.requests[0]?.user ?? '');
    expect(sent).toHaveLength(FEEDBACK_ANALYSIS_MAX_ENTRIES);
    expect(sent[0]?.[1]).toBe(`zz${String(total - 1).padStart(3, '0')}zz`);
    expect(sent.at(-1)?.[1]).toBe('zz020zz');
    expect(result).toMatchObject({ ok: true, view: { commentsAnalysed: FEEDBACK_ANALYSIS_MAX_ENTRIES, commentsAvailable: total } });
  });

  // @covers REQ-TRV-066@v1
  it('takes the newest even when the filter asks for another order', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 5, comment: 'old but best', on: '2026-10-01' });
    setup.giveFeedback({ rating: 1, comment: 'new but worst', on: '2026-10-05' });
    setup.ai.replyWith(SUMMARY);

    await setup.analysis.summarise(setup.administratorId, { sort: 'rating', order: 'desc' });

    expect(commentsSentIn(setup.ai.requests[0]?.user ?? '').map(([, comment]) => comment)).toEqual(['new but worst', 'old but best']);
  });

  // @covers REQ-TRV-066@v1
  it('records the request against the Administrator, with no Trip, and keeps its cost', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.replyWith(SUMMARY);

    await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    const [record] = aRequestRecord(setup);
    expect(record).toMatchObject({
      accountId: setup.administratorId,
      tripId: null,
      kind: 'feedback-summary',
      status: 'succeeded',
      inputTokens: DOUBLE_INPUT_TOKENS,
      outputTokens: DOUBLE_OUTPUT_TOKENS,
      replyText: SUMMARY,
    });
    expect(record?.requestText).toContain('too busy');
    expect(record?.costMicroUsd).toBeGreaterThan(0);
  });

  // @covers REQ-TRV-066@v1
  it('is not held back by a limit meant for Travelers’ Plan requests', async () => {
    const setup = anAnalysisSetup();
    generationsAlreadyMade(setup.db, setup.administratorId, 25, TODAY);
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.replyWith(SUMMARY);

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-066@v1
  it('says the AI is unavailable when it fails, and records the request as failed', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.failWith();

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(aRequestRecord(setup)[0]?.status).toBe('failed');
  });

  // @covers REQ-TRV-066@v1
  it('says the AI is unavailable when it does not answer in time', async () => {
    const setup = anAnalysisSetup({ timeoutMs: 20 });
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.neverAnswer();

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
  });

  // @covers REQ-TRV-066@v1
  it.each([['empty', ''], ['too long', 'x'.repeat(FEEDBACK_SUMMARY_MAX_CHARS + 1)]])('says the AI is unavailable when its reply is %s, and records it as failed', async (_name, reply) => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.replyWith(reply);

    const result = await setup.analysis.summarise(setup.administratorId, NO_FILTER);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(aRequestRecord(setup)[0]?.status).toBe('failed');
  });
});

describe('finding recurring themes in feedback', () => {
  // @covers REQ-TRV-067@v1
  it('shows the theme "schedules are too busy" with the two entries counted against it', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'Every day was too busy for us' });
    setup.giveFeedback({ rating: 1, comment: 'far too busy, no time to rest' });
    setup.giveFeedback({ rating: 5, comment: 'Wonderful food' });
    setup.ai.replyWith(themeOf('schedules are too busy', 'too busy'));

    const result = await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

    expect(result).toEqual({
      ok: true,
      view: { themes: [{ name: 'schedules are too busy', entries: 2 }], commentsAnalysed: 3, commentsAvailable: 3 },
    });
  });

  // @covers REQ-TRV-067@v1
  it('records the request as one for themes, with the comments it sent', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.ai.replyWith(themeOf('busy', 'busy'));

    await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

    const [record] = aRequestRecord(setup);
    expect(record).toMatchObject({ kind: 'feedback-themes', status: 'succeeded', tripId: null, accountId: setup.administratorId });
    expect(record?.requestText).toContain('too busy');
  });

  // @covers REQ-TRV-067@v1
  it('does not count entries the AI made up', async () => {
    const setup = anAnalysisSetup();
    setup.giveFeedback({ rating: 2, comment: 'too busy' });
    setup.giveFeedback({ rating: 2, comment: 'too busy again' });
    setup.ai.replyWith(JSON.stringify({ themes: [{ name: 'busy', entries: [1, 1, 2, 3, 40] }] }));

    const result = await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

    expect(result).toMatchObject({ ok: true, view: { themes: [{ name: 'busy', entries: 2 }] } });
  });

  // @covers REQ-TRV-067@v1
  it('does not send the identity of any Traveler when it asks for themes', async () => {
    const setup = anAnalysisSetup();
    const travelerId = setup.aTraveler();
    setup.db.update(accounts).set({ email: 'traveler@example.com', displayName: 'Jane Citizen' }).where(eq(accounts.id, travelerId)).run();
    const { tripId } = setup.aTripWithAPlan({ owner: travelerId });
    setup.feedback.save(travelerId, tripId, { rating: 2, comment: 'too busy' });
    setup.ai.replyWith(JSON.stringify({ themes: [] }));

    await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

    const everythingSent = `${setup.ai.requests[0]?.system}\n${setup.ai.requests[0]?.user}`;
    expect(everythingSent).not.toMatch(/Jane Citizen|traveler@example\.com/);
    expect(everythingSent).not.toContain(travelerId);
  });

  // @covers REQ-TRV-067@v1
  it.each([['is not usable', 'no themes here'], ['has the wrong shape', JSON.stringify({ themes: 'busy' })]])(
    'says the AI is unavailable when its reply %s, and records it as failed',
    async (_name, reply) => {
      const setup = anAnalysisSetup();
      setup.giveFeedback({ rating: 2, comment: 'too busy' });
      setup.ai.replyWith(reply);

      const result = await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

      expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
      expect(aRequestRecord(setup)[0]?.status).toBe('failed');
    },
  );

  // @covers REQ-TRV-067@v1
  it('does not ask the AI when there are no comments', async () => {
    const setup = anAnalysisSetup();

    const result = await setup.analysis.findThemes(setup.administratorId, NO_FILTER);

    expect(result).toEqual({ ok: false, error: 'nothing-to-analyse' });
    expect(setup.ai.requests).toHaveLength(0);
  });
});
