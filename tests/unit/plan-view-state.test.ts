import { describe, expect, test } from 'vitest';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE, PLAN_LIMIT_REACHED, type PlanView, type SavedPlan } from '../../src/shared/plan-schemas';
import {
  activityDetailRows,
  costLabel,
  dayHeading,
  durationLabel,
  EMPTY_PLAN_PANEL,
  panelAfterSave,
  versionDetail,
  versionLabel,
  type PlanPanel,
} from '../../src/web/pages/plan-view-state';
import { anActivity, aStay } from '../support/a-plan-reply';

const PLAN: PlanView = {
  currency: 'USD',
  days: [{ dayNumber: 1, date: '2026-10-10', activities: [anActivity()] }],
  stay: aStay(),
};

const FIRST_SAVED: SavedPlan = { ...PLAN, version: 1, createdAt: '2026-09-25T09:00:00.000Z', source: 'generation' };

describe('what the Trip page shows after asking for a Plan', () => {
  // @covers REQ-TRV-026@v1
  test('shows the Plan when the request succeeds', () => {
    const panel = panelAfterSave(EMPTY_PLAN_PANEL, { ok: true, status: 201, data: FIRST_SAVED });

    expect(panel).toEqual({ plan: FIRST_SAVED, notice: null, isGenerating: false });
  });

  // @covers REQ-TRV-026@v1
  test("shows the server's message, which states when the limit resets, when the daily limit is reached", () => {
    const message = "You have reached today's limit of 20 Plan generations. It resets at 2026-09-24 00:00 UTC.";

    const panel = panelAfterSave(EMPTY_PLAN_PANEL, { ok: false, status: 429, error: { code: PLAN_LIMIT_REACHED, message } });

    expect(panel).toEqual({ plan: null, notice: { kind: 'refused', message }, isGenerating: false });
  });

  // @covers REQ-TRV-029@v2
  test('shows the fallback message when the AI is unavailable', () => {
    const panel = panelAfterSave(EMPTY_PLAN_PANEL, {
      ok: false,
      status: 503,
      error: { code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE },
    });

    expect(panel).toEqual({ plan: null, notice: { kind: 'failed', message: AI_UNAVAILABLE_MESSAGE }, isGenerating: false });
  });

  // @covers REQ-TRV-029@v2
  test('shows a message when the server cannot be reached', () => {
    const panel = panelAfterSave(EMPTY_PLAN_PANEL, {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Could not reach the server. Try again.' },
    });

    expect(panel.notice).toEqual({ kind: 'failed', message: 'Could not reach the server. Try again.' });
  });

  // @covers REQ-TRV-029@v2
  test('shows a plain message when the server sends no explanation', () => {
    const panel = panelAfterSave(EMPTY_PLAN_PANEL, { ok: false, status: 500, error: { code: 'UNKNOWN' } });

    expect(panel.notice).toEqual({ kind: 'failed', message: expect.stringMatching(/try again/i) });
  });
});

describe('showing an Activity', () => {
  // @covers REQ-TRV-044@v1
  test('gives its time, duration, estimated cost, location and why it was recommended', () => {
    const activity = anActivity({
      startTime: '09:00',
      durationMinutes: 90,
      estimatedCost: 25,
      location: 'Asakusa',
      reason: 'The oldest temple in Tokyo, best seen early.',
    });

    expect(activityDetailRows(activity, 'USD')).toEqual([
      { label: 'Time', value: '09:00' },
      { label: 'Duration', value: '1 h 30 min' },
      { label: 'Estimated cost', value: '25 USD (an estimate, not a price)' },
      { label: 'Location', value: 'Asakusa' },
      { label: 'Why it was recommended', value: 'The oldest temple in Tokyo, best seen early.' },
    ]);
  });

  // @covers REQ-TRV-044@v1
  test.each([
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [150, '2 h 30 min'],
  ])('writes a duration of %i minutes as %s', (minutes, expected) => {
    expect(durationLabel(minutes)).toBe(expected);
  });

  // @covers REQ-TRV-044@v1
  test('writes a cost of nothing the same way as any other estimate', () => {
    expect(costLabel(0, 'EUR')).toBe('0 EUR (an estimate, not a price)');
  });

  // @covers REQ-TRV-026@v1
  test('heads each Day with its number and its date', () => {
    expect(dayHeading({ dayNumber: 3, date: '2026-10-12', activities: [] })).toBe('Day 3, 2026-10-12');
  });
});

describe('the recommendation notice', () => {
  // @covers REQ-TRV-031@v1
  test('says the Activities, times and costs are recommendations, not guaranteed availability, prices or bookings', () => {
    expect(PLAN_RECOMMENDATION_NOTICE).toContain('Activities, times and costs are recommendations');
    expect(PLAN_RECOMMENDATION_NOTICE).toContain('not guaranteed availability, prices or bookings');
  });
});

const SAVED: SavedPlan = { ...PLAN, version: 2, createdAt: '2026-09-25T10:05:00.000Z', source: 'generation' };
const EARLIER: SavedPlan = { ...PLAN, version: 1, createdAt: '2026-09-25T09:00:00.000Z', source: 'generation' };
const SHOWING_EARLIER: PlanPanel = { plan: EARLIER, notice: null, isGenerating: true };

describe('the Trip page after a request that saves a Plan', () => {
  // @covers REQ-TRV-017@v1
  test('shows the newly saved Plan, and no message, when generating succeeds', () => {
    const panel = panelAfterSave(EMPTY_PLAN_PANEL, { ok: true, status: 201, data: SAVED });

    expect(panel).toEqual({ plan: SAVED, notice: null, isGenerating: false });
  });

  // @covers REQ-TRV-018@v1
  test('shows the restored version as the current Plan when restoring succeeds', () => {
    const panel = panelAfterSave(SHOWING_EARLIER, { ok: true, status: 201, data: SAVED });

    expect(panel.plan).toBe(SAVED);
    expect(panel.isGenerating).toBe(false);
  });

  // @covers REQ-TRV-018@v1
  test('keeps the saved Plan on show, with the message beside it, when a request fails', () => {
    const panel = panelAfterSave(SHOWING_EARLIER, {
      ok: false,
      status: 503,
      error: { code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE },
    });

    expect(panel).toEqual({ plan: EARLIER, notice: { kind: 'failed', message: AI_UNAVAILABLE_MESSAGE }, isGenerating: false });
  });

  // @covers REQ-TRV-018@v1
  test('keeps the saved Plan on show, with the reset time beside it, when the daily limit is reached', () => {
    const message = "You have reached today's limit of 2 Plan generations. It resets at 2026-09-26 00:00 UTC.";

    const panel = panelAfterSave(SHOWING_EARLIER, { ok: false, status: 429, error: { code: PLAN_LIMIT_REACHED, message } });

    expect(panel).toEqual({ plan: EARLIER, notice: { kind: 'refused', message }, isGenerating: false });
  });
});

describe('the version list', () => {
  const summary = { version: 3, createdAt: '2026-09-25T10:05:00.000Z', source: 'restore' } as const;

  // @covers REQ-TRV-018@v1
  test('names a version by its number', () => {
    expect(versionLabel(summary)).toBe('Version 3');
  });

  // @covers REQ-TRV-018@v1
  test('says when a version was saved, in UTC, whether it came from a generation or a restore, and which is current', () => {
    expect(versionDetail(summary, true)).toBe('saved 2026-09-25 10:05 UTC, restored from an earlier version (current)');
    expect(versionDetail({ ...summary, version: 2, source: 'generation' }, false)).toBe('saved 2026-09-25 10:05 UTC, generated');
  });
});
