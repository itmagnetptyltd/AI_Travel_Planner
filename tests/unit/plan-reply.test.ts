import { describe, expect, test } from 'vitest';
import { parseActivityReply, parseDayReply, parsePlanReply, type PlanReplyTrip } from '../../src/server/plans/plan-reply';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';

const TRAVELLERS = { adults: 2, children: 2, budget: 5000 } as const;
const EIGHT_DAY_TRIP: PlanReplyTrip = { startDate: '2026-10-10', dayCount: 8, currency: 'USD', ...TRAVELLERS };
const ONE_DAY_TRIP: PlanReplyTrip = { ...EIGHT_DAY_TRIP, dayCount: 1 };

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

    const plan = parsedPlan(text, ONE_DAY_TRIP);

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

    const result = parsePlanReply(text, ONE_DAY_TRIP);

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

      const result = parsePlanReply(JSON.stringify(raw), ONE_DAY_TRIP);

      expect(result.ok).toBe(false);
    },
  );

  // @covers REQ-TRV-027@v1
  test('refuses an Activity with no estimated cost', () => {
    const raw = JSON.parse(aPlanReplyText({ dayCount: 1 })) as { days: { activities: Record<string, unknown>[] }[] };
    delete raw.days[0]?.activities[0]?.['estimatedCost'];

    const result = parsePlanReply(JSON.stringify(raw), ONE_DAY_TRIP);

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

describe('what the server adds to a Plan it reads from the AI', () => {
  // @covers REQ-TRV-045@v1
  test('gives every Activity its own id, none of them empty, and none of them changed by hand', () => {
    const plan = parsedPlan(aPlanReplyText({ dayCount: 8 }));

    const activities = plan.days.flatMap((day) => day.activities);
    const ids = activities.map((activity) => activity.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(activities.length);
    expect(activities.every((activity) => activity.changedByHand === false)).toBe(true);
  });

  // @covers REQ-TRV-098@v1
  test('records the travelers and budget the Plan was made for, so a later change to them can be noticed', () => {
    const plan = parsedPlan(aPlanReplyText({ dayCount: 8 }));

    expect(plan.basis).toEqual({ adults: 2, children: 2, budget: 5000 });
  });

  // @covers REQ-TRV-045@v1
  test('ignores an id or a changed-by-hand flag the AI wrote', () => {
    const raw = JSON.parse(aPlanReplyText({ dayCount: 1 })) as { days: { activities: Record<string, unknown>[] }[] };
    for (const activity of raw.days[0]?.activities ?? []) {
      activity['id'] = 'chosen-by-the-ai';
      activity['changedByHand'] = true;
    }

    const result = parsePlanReply(JSON.stringify(raw), ONE_DAY_TRIP);

    if (!result.ok) throw new Error(result.problem);
    const activities = result.plan.days.flatMap((day) => day.activities);
    expect(activities.map((activity) => activity.id)).not.toContain('chosen-by-the-ai');
    expect(activities.every((activity) => activity.changedByHand === false)).toBe(true);
  });
});

describe('reading the AI reply for one Day', () => {
  const dayReply = (dayNumber: number, activities: readonly Partial<ReturnType<typeof anActivity>>[]) =>
    JSON.stringify({ dayNumber, activities: activities.map((activity) => anActivity(activity)) });

  // @covers REQ-TRV-042@v1
  test('gives the Activities of the Day, in start-time order, each with its own id and not changed by hand', () => {
    const result = parseDayReply(dayReply(4, [{ startTime: '18:00' }, { startTime: '09:00', title: 'Early walk' }]), 4);

    if (!result.ok) throw new Error(result.problem);
    expect(result.activities.map((a) => a.startTime)).toEqual(['09:00', '18:00']);
    expect(result.activities.map((a) => a.changedByHand)).toEqual([false, false]);
    expect(new Set(result.activities.map((a) => a.id)).size).toBe(2);
  });

  // @covers REQ-TRV-042@v1
  test('refuses a reply about a different Day than the one asked for', () => {
    expect(parseDayReply(dayReply(5, [{}]), 4)).toEqual({ ok: false, problem: 'wrong-day' });
  });

  // @covers REQ-TRV-042@v1
  test('refuses a reply with no Activity, because a regenerated Day must not come back empty', () => {
    expect(parseDayReply(dayReply(4, []), 4)).toEqual({ ok: false, problem: 'invalid' });
  });

  // @covers REQ-TRV-042@v1
  test('refuses text that is not JSON, and an Activity missing its cost', () => {
    const noCost = JSON.parse(dayReply(4, [{}])) as { activities: Record<string, unknown>[] };
    delete noCost.activities[0]?.['estimatedCost'];

    expect(parseDayReply('Sorry, I cannot help with that.', 4)).toEqual({ ok: false, problem: 'not-json' });
    expect(parseDayReply(JSON.stringify(noCost), 4)).toEqual({ ok: false, problem: 'invalid' });
  });

  // @covers REQ-TRV-042@v1
  test('refuses a reply that is a whole Plan, not one Day', () => {
    expect(parseDayReply(aPlanReplyText({ dayCount: 8 }), 4).ok).toBe(false);
  });
});

describe('reading the AI reply for a replacement Activity', () => {
  // @covers REQ-TRV-047@v1
  test('gives the suggested Activity with its time, duration, cost, location and category', () => {
    const result = parseActivityReply(JSON.stringify({ activity: anActivity({ title: 'Tea ceremony', estimatedCost: 30 }) }));

    if (!result.ok) throw new Error(result.problem);
    expect(result.activity).toMatchObject({ title: 'Tea ceremony', startTime: '09:00', durationMinutes: 90, estimatedCost: 30, location: 'Asakusa', category: 'Activities' });
  });

  // @covers REQ-TRV-047@v1
  test('refuses text that is not JSON, and an Activity that is not valid', () => {
    expect(parseActivityReply('no')).toEqual({ ok: false, problem: 'not-json' });
    expect(parseActivityReply(JSON.stringify({ activity: { title: 'x' } }))).toEqual({ ok: false, problem: 'invalid' });
  });
});
