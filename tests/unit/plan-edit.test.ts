import { describe, expect, test } from 'vitest';
import {
  adjustToDates,
  dayNumbersWithHandChanges,
  editActivity,
  moveActivity,
  removeActivity,
  replaceActivity,
  replaceDay,
  type NewActivity,
} from '../../src/server/plans/plan-edit';
import type { PlanActivity, PlanView } from '../../src/shared/plan-schemas';
import { activityIn, allActivities, aPlanView, withActivityChanged } from '../support/a-plan';

const A_TYPED_ACTIVITY: NewActivity = {
  title: 'Sunrise swim',
  startTime: '09:00',
  durationMinutes: 45,
  estimatedCost: 0,
  location: 'Kamo river',
};

function planAfter(result: ReturnType<typeof editActivity>): PlanView {
  if (!result.ok) throw new Error(`Expected the edit to work, got ${result.error}`);
  return result.plan;
}

const titlesOn = (plan: PlanView, dayNumber: number): string[] =>
  plan.days.find((day) => day.dayNumber === dayNumber)?.activities.map((a) => a.title) ?? [];

describe('editing an Activity', () => {
  // @covers REQ-TRV-045@v1
  test('changes an Activity from 10:00 to 11:00 and leaves every other Activity as it was', () => {
    const plan = withActivityChanged(aPlanView({ days: 3 }), 'Plan A-day-2-morning', { startTime: '10:00' });

    const edited = planAfter(editActivity(plan, 'Plan A-day-2-morning', { startTime: '11:00' }));

    expect(edited.days[1]?.activities.map((a) => [a.title, a.startTime])).toEqual([
      ['Plan A morning 2', '11:00'],
      ['Plan A lunch 2', '12:30'],
    ]);
    expect(edited.days[0]).toEqual(plan.days[0]);
    expect(edited.days[2]).toEqual(plan.days[2]);
  });

  // @covers REQ-TRV-045@v1
  test('keeps the Day in start-time order after the time changes', () => {
    const plan = aPlanView({ days: 1 });

    const edited = planAfter(editActivity(plan, 'Plan A-day-1-morning', { startTime: '13:00' }));

    expect(titlesOn(edited, 1)).toEqual(['Plan A lunch 1', 'Plan A morning 1']);
  });

  // @covers REQ-TRV-045@v1
  test('marks the Activity as changed by hand, and only that one', () => {
    const edited = planAfter(editActivity(aPlanView({ days: 2 }), 'Plan A-day-1-lunch', { title: 'Sushi class' }));

    expect(allActivities(edited).filter((a) => a.changedByHand).map((a) => a.id)).toEqual(['Plan A-day-1-lunch']);
  });

  // @covers REQ-TRV-045@v1
  test('changes the title, duration, cost and location as well as the time', () => {
    const edited = planAfter(
      editActivity(aPlanView({ days: 1 }), 'Plan A-day-1-morning', {
        title: 'Garden walk',
        durationMinutes: 30,
        estimatedCost: 5,
        location: 'Botanic garden',
      }),
    );

    expect(activityIn(edited, 1, 0)).toMatchObject({
      id: 'Plan A-day-1-morning',
      title: 'Garden walk',
      durationMinutes: 30,
      estimatedCost: 5,
      location: 'Botanic garden',
      reason: 'Reason for Plan A day 1',
    });
  });

  test('refuses an Activity that is not in the Plan', () => {
    expect(editActivity(aPlanView(), 'no-such-activity', { startTime: '11:00' })).toEqual({ ok: false, error: 'activity-not-found' });
  });

  test('leaves the Plan it was given exactly as it was', () => {
    const plan = aPlanView({ days: 2 });
    const before = structuredClone(plan);

    editActivity(plan, 'Plan A-day-1-morning', { startTime: '11:00' });
    removeActivity(plan, 'Plan A-day-1-morning');
    moveActivity(plan, 'Plan A-day-1-morning', 2);
    replaceActivity(plan, 'Plan A-day-1-morning', A_TYPED_ACTIVITY, 'typed');
    adjustToDates(plan, '2026-11-01', 1);

    expect(plan).toEqual(before);
  });
});

describe('removing an Activity', () => {
  // @covers REQ-TRV-046@v1
  test('takes the Activity off its Day and touches nothing else', () => {
    const plan = aPlanView({ days: 3 });

    const result = removeActivity(plan, 'Plan A-day-2-morning');

    if (!result.ok) throw new Error(result.error);
    expect(titlesOn(result.plan, 2)).toEqual(['Plan A lunch 2']);
    expect(result.plan.days[0]).toEqual(plan.days[0]);
    expect(result.plan.days[2]).toEqual(plan.days[2]);
  });

  test('refuses an Activity that is not in the Plan', () => {
    expect(removeActivity(aPlanView(), 'no-such-activity')).toEqual({ ok: false, error: 'activity-not-found' });
  });
});

describe('moving an Activity to another Day', () => {
  // @covers REQ-TRV-048@v1
  test('takes an Activity off Day 2 and puts it on Day 5', () => {
    const result = moveActivity(aPlanView({ days: 5 }), 'Plan A-day-2-morning', 5);

    if (!result.ok) throw new Error(result.error);
    expect(titlesOn(result.plan, 2)).toEqual(['Plan A lunch 2']);
    expect(titlesOn(result.plan, 5)).toContain('Plan A morning 2');
  });

  // @covers REQ-TRV-048@v1
  test('leaves Day 5 holding six Activities in start-time order when a 12:00 Activity joins five', () => {
    const fiveOnDay5: PlanActivity[] = ['08:00', '10:00', '13:00', '15:00', '19:00'].map((startTime, index) => ({
      ...activityIn(aPlanView({ days: 5 }), 5, 0),
      id: `five-${index}`,
      title: `Day 5 item ${index}`,
      startTime,
    }));
    const base = aPlanView({ days: 5 });
    const plan: PlanView = {
      ...base,
      days: base.days.map((day) => (day.dayNumber === 5 ? { ...day, activities: fiveOnDay5 } : day)),
    };
    const noon = withActivityChanged(plan, 'Plan A-day-2-morning', { startTime: '12:00' });

    const result = moveActivity(noon, 'Plan A-day-2-morning', 5);

    if (!result.ok) throw new Error(result.error);
    const day5 = result.plan.days.find((day) => day.dayNumber === 5)?.activities ?? [];
    expect(day5).toHaveLength(6);
    expect(day5.map((a) => a.startTime)).toEqual(['08:00', '10:00', '12:00', '13:00', '15:00', '19:00']);
  });

  // @covers REQ-TRV-048@v1
  test('keeps the Activity itself, with its own id, and marks it changed by hand', () => {
    const result = moveActivity(aPlanView({ days: 5 }), 'Plan A-day-2-morning', 5);

    if (!result.ok) throw new Error(result.error);
    const moved = allActivities(result.plan).find((a) => a.id === 'Plan A-day-2-morning');
    expect(moved).toMatchObject({ title: 'Plan A morning 2', changedByHand: true });
  });

  test('refuses a Day that is not in the Plan', () => {
    expect(moveActivity(aPlanView({ days: 3 }), 'Plan A-day-1-morning', 9)).toEqual({ ok: false, error: 'day-not-found' });
  });

  test('refuses an Activity that is not in the Plan', () => {
    expect(moveActivity(aPlanView({ days: 3 }), 'no-such-activity', 2)).toEqual({ ok: false, error: 'activity-not-found' });
  });

  test('refuses a move to the Day the Activity is already on', () => {
    expect(moveActivity(aPlanView({ days: 3 }), 'Plan A-day-1-morning', 1)).toEqual({ ok: false, error: 'already-on-that-day' });
  });
});

describe('replacing an Activity', () => {
  // @covers REQ-TRV-047@v1
  test('leaves the replaced Activity off its Day and a different one in its place', () => {
    const plan = aPlanView({ days: 2 });

    const result = replaceActivity(plan, 'Plan A-day-1-morning', A_TYPED_ACTIVITY, 'typed');

    if (!result.ok) throw new Error(result.error);
    expect(titlesOn(result.plan, 1)).toEqual(['Sunrise swim', 'Plan A lunch 1']);
    expect(allActivities(result.plan).some((a) => a.id === 'Plan A-day-1-morning')).toBe(false);
  });

  // @covers REQ-TRV-047@v1
  test('gives the typed Activity its own id, marks it changed by hand, and keeps the time, duration, location and cost typed', () => {
    const result = replaceActivity(aPlanView({ days: 1 }), 'Plan A-day-1-morning', { ...A_TYPED_ACTIVITY, estimatedCost: 12 }, 'typed');

    if (!result.ok) throw new Error(result.error);
    expect(activityIn(result.plan, 1, 0)).toMatchObject({
      title: 'Sunrise swim',
      startTime: '09:00',
      durationMinutes: 45,
      estimatedCost: 12,
      location: 'Kamo river',
      changedByHand: true,
    });
    expect(activityIn(result.plan, 1, 0).id).not.toBe('Plan A-day-1-morning');
    expect(activityIn(result.plan, 1, 0).id).not.toBe('');
  });

  // @covers REQ-TRV-047@v1
  test('does not mark an Activity the AI suggested as changed by hand', () => {
    const result = replaceActivity(aPlanView({ days: 1 }), 'Plan A-day-1-morning', A_TYPED_ACTIVITY, 'suggestion');

    if (!result.ok) throw new Error(result.error);
    expect(activityIn(result.plan, 1, 0).changedByHand).toBe(false);
  });

  test('refuses an Activity that is not in the Plan', () => {
    expect(replaceActivity(aPlanView(), 'no-such-activity', A_TYPED_ACTIVITY, 'typed')).toEqual({ ok: false, error: 'activity-not-found' });
  });
});

describe('replacing one Day', () => {
  // @covers REQ-TRV-042@v1
  test('leaves every other Day exactly as it was', () => {
    const plan = aPlanView({ days: 8 });
    const fresh = aPlanView({ days: 8, label: 'Fresh' }).days[3]?.activities ?? [];

    const result = replaceDay(plan, 4, fresh);

    if (!result.ok) throw new Error(result.error);
    expect(result.plan.days.filter((day) => day.dayNumber !== 4)).toEqual(plan.days.filter((day) => day.dayNumber !== 4));
    expect(titlesOn(result.plan, 4)).toEqual(['Fresh morning 4', 'Fresh lunch 4']);
  });

  test('keeps the Day number and date of the Day it replaces', () => {
    const plan = aPlanView({ days: 8 });

    const result = replaceDay(plan, 4, aPlanView({ label: 'Fresh' }).days[0]?.activities ?? []);

    if (!result.ok) throw new Error(result.error);
    expect(result.plan.days[3]).toMatchObject({ dayNumber: 4, date: plan.days[3]?.date });
  });

  test('refuses a Day that is not in the Plan', () => {
    expect(replaceDay(aPlanView({ days: 3 }), 9, [])).toEqual({ ok: false, error: 'day-not-found' });
  });
});

describe('finding what the Traveler changed by hand', () => {
  // @covers REQ-TRV-041@v1
  test('finds the Days holding a hand-changed Activity across the whole Plan', () => {
    let plan = aPlanView({ days: 6 });
    plan = withActivityChanged(plan, 'Plan A-day-4-morning', { changedByHand: true });
    plan = withActivityChanged(plan, 'Plan A-day-5-lunch', { changedByHand: true });

    expect(dayNumbersWithHandChanges(plan)).toEqual([4, 5]);
  });

  // @covers REQ-TRV-042@v1
  test('finds only the one Day when asked about a single Day', () => {
    let plan = aPlanView({ days: 6 });
    plan = withActivityChanged(plan, 'Plan A-day-4-morning', { changedByHand: true });
    plan = withActivityChanged(plan, 'Plan A-day-5-lunch', { changedByHand: true });

    expect(dayNumbersWithHandChanges(plan, 4)).toEqual([4]);
    expect(dayNumbersWithHandChanges(plan, 3)).toEqual([]);
  });

  // @covers REQ-TRV-041@v1
  test('finds nothing in a Plan the AI wrote and the Traveler has not touched', () => {
    expect(dayNumbersWithHandChanges(aPlanView({ days: 8 }))).toEqual([]);
  });
});

describe('fitting a Plan to new Trip dates', () => {
  // @covers REQ-TRV-098@v1
  test('keeps the first 5 Days of an 8-Day Plan, with the same Activities in order', () => {
    const plan = aPlanView({ days: 8 });

    const adjusted = adjustToDates(plan, '2026-10-10', 5);

    expect(adjusted.days).toHaveLength(5);
    expect(adjusted.days).toEqual(plan.days.slice(0, 5));
  });

  // @covers REQ-TRV-098@v1
  test('keeps Days 1 to 8 as they were and adds Days 9 and 10 empty when the Trip grows to 10 Days', () => {
    const plan = aPlanView({ days: 8 });

    const adjusted = adjustToDates(plan, '2026-10-10', 10);

    expect(adjusted.days.slice(0, 8)).toEqual(plan.days);
    expect(adjusted.days.slice(8)).toEqual([
      { dayNumber: 9, date: '2026-10-18', activities: [] },
      { dayNumber: 10, date: '2026-10-19', activities: [] },
    ]);
  });

  // @covers REQ-TRV-098@v1
  test('dates Day 1 as 2026-10-12 with the former Day 1 Activities when the Trip moves two days later', () => {
    const plan = aPlanView({ days: 8 });

    const adjusted = adjustToDates(plan, '2026-10-12', 8);

    expect(adjusted.days.map((day) => day.date)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
      '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    ]);
    expect(adjusted.days.map((day) => day.activities)).toEqual(plan.days.map((day) => day.activities));
  });

  test('leaves the stay, the currency and the basis as they were', () => {
    const plan = aPlanView({ days: 3 });

    const adjusted = adjustToDates(plan, '2026-11-01', 4);

    expect(adjusted).toMatchObject({ currency: plan.currency, stay: plan.stay, basis: plan.basis });
  });
});
