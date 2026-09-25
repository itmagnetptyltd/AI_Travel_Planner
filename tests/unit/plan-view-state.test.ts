import { describe, expect, test } from 'vitest';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE, PLAN_LIMIT_REACHED, type PlanView } from '../../src/shared/plan-schemas';
import {
  activityDetailRows,
  costLabel,
  dayHeading,
  durationLabel,
  planStateAfter,
} from '../../src/web/pages/plan-view-state';
import { anActivity, aStay } from '../support/a-plan-reply';

const PLAN: PlanView = {
  currency: 'USD',
  days: [{ dayNumber: 1, date: '2026-10-10', activities: [anActivity()] }],
  stay: aStay(),
};

describe('what the Trip page shows after asking for a Plan', () => {
  // @covers REQ-TRV-026@v1
  test('shows the Plan when the request succeeds', () => {
    expect(planStateAfter({ ok: true, status: 201, data: PLAN })).toEqual({ kind: 'shown', plan: PLAN });
  });

  // @covers REQ-TRV-026@v1
  test('shows the server\'s message, which states when the limit resets, when the daily limit is reached', () => {
    const message = "You have reached today's limit of 20 Plan generations. It resets at 2026-09-24 00:00 UTC.";

    const state = planStateAfter({ ok: false, status: 429, error: { code: PLAN_LIMIT_REACHED, message } });

    expect(state).toEqual({ kind: 'refused', message });
  });

  // @covers REQ-TRV-029@v2
  test('shows the fallback message when the AI is unavailable', () => {
    const state = planStateAfter({
      ok: false,
      status: 503,
      error: { code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE },
    });

    expect(state).toEqual({ kind: 'failed', message: AI_UNAVAILABLE_MESSAGE });
  });

  // @covers REQ-TRV-029@v2
  test('shows a message when the server cannot be reached', () => {
    const state = planStateAfter({
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Could not reach the server. Try again.' },
    });

    expect(state).toEqual({ kind: 'failed', message: 'Could not reach the server. Try again.' });
  });

  // @covers REQ-TRV-029@v2
  test('shows a plain message when the server sends no explanation', () => {
    const state = planStateAfter({ ok: false, status: 500, error: { code: 'UNKNOWN' } });

    expect(state).toEqual({ kind: 'failed', message: expect.stringMatching(/try again/i) });
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
