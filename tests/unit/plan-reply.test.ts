import { describe, expect, test } from 'vitest';
import { parsePlanReply, type PlanReplyTrip } from '../../src/server/plans/plan-reply';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';

const EIGHT_DAY_TRIP: PlanReplyTrip = { startDate: '2026-10-10', dayCount: 8, currency: 'USD' };

function parsedPlan(text: string, trip = EIGHT_DAY_TRIP) {
  const result = parsePlanReply(text, trip);
  if (!result.ok) throw new Error(`Expected a Plan, got ${result.problem}`);
  return result.plan;
}

describe('reading the AI reply into a Plan', () => {
  // @covers REQ-TRV-026@v1
  test('dates the Days from the Trip start date, not from anything the AI wrote', () => {
    const plan = parsedPlan(aPlanReplyText({ dayCount: 8 }));

    expect(plan.days.map((day) => day.date)).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
    ]);
  });

  // @covers REQ-TRV-026@v1
  test('orders the Activities of a Day by start time', () => {
    const text = aPlanReplyText({
      days: [
        {
          dayNumber: 1,
          activities: ['19:00', '08:00', '13:00', '10:30', '15:00'].map((startTime) => anActivity({ startTime })),
        },
      ],
    });

    const plan = parsedPlan(text, { startDate: '2026-10-10', dayCount: 1, currency: 'USD' });

    expect(plan.days[0]?.activities.map((a) => a.startTime)).toEqual(['08:00', '10:30', '13:00', '15:00', '19:00']);
  });

  // @covers REQ-TRV-026@v1
  test('refuses a reply with fewer Days than the Trip', () => {
    const result = parsePlanReply(aPlanReplyText({ dayCount: 7 }), EIGHT_DAY_TRIP);

    expect(result).toEqual({ ok: false, problem: 'wrong-days' });
  });

  // @covers REQ-TRV-026@v1
  test('refuses a reply in which a Day holds no Activity', () => {
    const text = aPlanReplyText({ days: [{ dayNumber: 1, activities: [] }] });

    const result = parsePlanReply(text, { startDate: '2026-10-10', dayCount: 1, currency: 'USD' });

    expect(result.ok).toBe(false);
  });

  // @covers REQ-TRV-026@v1
  test('refuses a reply that is not JSON', () => {
    expect(parsePlanReply('Sorry, I cannot help with that.', EIGHT_DAY_TRIP)).toEqual({
      ok: false,
      problem: 'not-json',
    });
  });

  // @covers REQ-TRV-026@v1
  test('reads a reply the AI wrapped in a code fence', () => {
    const fenced = `Here is your plan:\n\`\`\`json\n${aPlanReplyText({ dayCount: 8 })}\n\`\`\``;

    expect(parsePlanReply(fenced, EIGHT_DAY_TRIP).ok).toBe(true);
  });

  // @covers REQ-TRV-027@v1
  test.each(['reason', 'location', 'startTime', 'category'] as const)(
    'refuses an Activity that is missing its %s',
    (field) => {
      const raw = JSON.parse(aPlanReplyText({ dayCount: 1 })) as { days: { activities: Record<string, unknown>[] }[] };
      delete raw.days[0]?.activities[0]?.[field];

      const result = parsePlanReply(JSON.stringify(raw), { startDate: '2026-10-10', dayCount: 1, currency: 'USD' });

      expect(result.ok).toBe(false);
    },
  );

  // @covers REQ-TRV-027@v1
  test('refuses an Activity with no estimated cost', () => {
    const raw = JSON.parse(aPlanReplyText({ dayCount: 1 })) as { days: { activities: Record<string, unknown>[] }[] };
    delete raw.days[0]?.activities[0]?.['estimatedCost'];

    const result = parsePlanReply(JSON.stringify(raw), { startDate: '2026-10-10', dayCount: 1, currency: 'USD' });

    expect(result.ok).toBe(false);
  });

  // @covers REQ-TRV-027@v1
  test('keeps a hotel stay in the stay summary and on no Day', () => {
    const plan = parsedPlan(aPlanReplyText({ dayCount: 8, stay: { accommodationType: 'Hotel', suggestedArea: 'Gion' } }));

    expect(plan.stay).toEqual({ accommodationType: 'Hotel', suggestedArea: 'Gion', nightlyCostEstimate: 150 });
    const everyTitle = plan.days.flatMap((day) => day.activities.map((a) => a.title.toLowerCase()));
    expect(everyTitle.some((title) => title.includes('hotel'))).toBe(false);
  });

  // @covers REQ-TRV-027@v1
  test('refuses a reply with no stay summary', () => {
    const result = parsePlanReply(aPlanReplyText({ dayCount: 8, stay: null }), EIGHT_DAY_TRIP);

    expect(result.ok).toBe(false);
  });
});
