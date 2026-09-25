import { describe, expect, test } from 'vitest';
import { applyProposal, buildProposal } from '../../src/server/chat/chat-proposal';
import type { PlanView } from '../../src/shared/plan-schemas';
import { activityIn, allActivities, aPlanView, withActivityChanged } from '../support/a-plan';
import { aPlanWithShopping, asChange } from '../support/a-chat-plan';

const NEW_ACTIVITY = {
  title: 'Sushi class',
  startTime: '16:00',
  durationMinutes: 90,
  estimatedCost: 60,
  location: 'Gion',
  reason: 'Learn to make sushi.',
  category: 'Activities',
} as const;

function proposedFor(plan: PlanView, dayNumber: number, activities: ReturnType<typeof asChange>[]) {
  const built = buildProposal(plan, [{ dayNumber, activities }]);
  if (!built.ok) throw new Error(built.error);
  return built.days;
}

const dayThree = (plan: PlanView) => plan.days[2]?.activities ?? [];

describe('marking what a chat change adds, removes and alters', () => {
  // @covers REQ-TRV-038@v1
  test('marks an Activity that was not there before as added', () => {
    const plan = aPlanView({ days: 3 });

    const [day] = proposedFor(plan, 3, [...dayThree(plan).map(asChange), NEW_ACTIVITY]);

    expect(day?.activities.map((a) => [a.title, a.mark])).toEqual([
      ['Plan A morning 3', 'unchanged'],
      ['Plan A lunch 3', 'unchanged'],
      ['Sushi class', 'added'],
    ]);
    expect(day?.removed).toEqual([]);
  });

  // @covers REQ-TRV-038@v1
  test('marks an Activity that is no longer there as removed, and keeps it to show', () => {
    const plan = aPlanView({ days: 3 });

    const [day] = proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0))]);

    expect(day?.activities.map((a) => a.title)).toEqual(['Plan A morning 3']);
    expect(day?.removed.map((a) => a.title)).toEqual(['Plan A lunch 3']);
  });

  // @covers REQ-TRV-038@v1
  test('marks one Activity removed and another added when a change does both', () => {
    const plan = aPlanView({ days: 3 });

    const [day] = proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0)), NEW_ACTIVITY]);

    expect(day?.activities.filter((a) => a.mark === 'added').map((a) => a.title)).toEqual(['Sushi class']);
    expect(day?.removed.map((a) => a.title)).toEqual(['Plan A lunch 3']);
  });

  // @covers REQ-TRV-038@v1
  test('marks an Activity with the same title but a different start time as altered, and keeps its id', () => {
    const plan = aPlanView({ days: 3 });
    const lunch = activityIn(plan, 3, 1);

    const [day] = proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0)), { ...asChange(lunch), startTime: '13:30' }]);

    const altered = day?.activities.find((a) => a.mark === 'altered');
    expect(altered).toMatchObject({ id: lunch.id, title: lunch.title, startTime: '13:30', changedByHand: false });
    expect(day?.removed).toEqual([]);
  });

  // @covers REQ-TRV-038@v1
  test('matches titles without regard to case, so a change of capitals alone is no change', () => {
    const plan = aPlanView({ days: 3 });

    const days = proposedFor(plan, 3, dayThree(plan).map((a) => ({ ...asChange(a), title: a.title.toUpperCase() })));

    expect(days).toEqual([]);
  });

  // @covers REQ-TRV-038@v1
  test('leaves an unchanged Activity as it was, with its id and its changed-by-hand mark', () => {
    const plan = withActivityChanged(aPlanView({ days: 3 }), 'Plan A-day-3-morning', { changedByHand: true, startTime: '10:00' });

    const [day] = proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0)), { ...asChange(activityIn(plan, 3, 1)), startTime: '13:00' }]);

    expect(day?.activities.find((a) => a.id === 'Plan A-day-3-morning')).toMatchObject({ changedByHand: true, mark: 'unchanged' });
  });

  // @covers REQ-TRV-038@v1
  test('orders the proposed Day by start time, and gives an added Activity an id of its own', () => {
    const plan = aPlanView({ days: 3 });

    const [day] = proposedFor(plan, 3, [...dayThree(plan).map(asChange), { ...NEW_ACTIVITY, startTime: '07:00' }]);

    expect(day?.activities.map((a) => a.startTime)).toEqual(['07:00', '09:00', '12:30']);
    const added = day?.activities[0];
    expect(added?.id).toBeTruthy();
    expect(allActivities(plan).map((a) => a.id)).not.toContain(added?.id);
    expect(added?.changedByHand).toBe(false);
  });
});

describe('applying a chat change to the Plan', () => {
  // @covers REQ-TRV-037@v1
  test('leaves Day 3 without its shopping Activity when the change omits it', () => {
    const plan = aPlanWithShopping();
    const keep = dayThree(plan).filter((a) => a.category !== 'Shopping').map(asChange);

    const days = proposedFor(plan, 3, keep);
    const changed = applyProposal(plan, days);

    expect(dayThree(changed).some((a) => a.category === 'Shopping')).toBe(false);
    expect(dayThree(changed)).toHaveLength(2);
    expect(days[0]?.removed.map((a) => a.title)).toEqual(['Shopping at Nishiki market']);
  });

  // @covers REQ-TRV-039@v1
  test('leaves the Activities of every Day but Day 2 identical when the change is for Day 2', () => {
    const plan = aPlanView({ days: 8 });

    const changed = applyProposal(plan, proposedFor(plan, 2, [asChange(activityIn(plan, 2, 0))]));

    expect(changed.days.filter((day) => day.dayNumber !== 2)).toEqual(plan.days.filter((day) => day.dayNumber !== 2));
    expect(changed.days[1]?.activities.map((a) => a.title)).toEqual(['Plan A morning 2']);
  });

  // @covers REQ-TRV-039@v1
  test('keeps the stay, the currency and the basis, and carries no mark into the Plan', () => {
    const plan = aPlanView({ days: 3 });

    const changed = applyProposal(plan, proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0)), NEW_ACTIVITY]));

    expect(changed).toMatchObject({ currency: plan.currency, stay: plan.stay, basis: plan.basis });
    expect(JSON.stringify(changed)).not.toContain('"mark"');
  });

  // @covers REQ-TRV-037@v1
  test('gives no proposal at all for a change that changes nothing', () => {
    const plan = aPlanView({ days: 3 });

    expect(proposedFor(plan, 3, dayThree(plan).map(asChange))).toEqual([]);
  });

  // @covers REQ-TRV-039@v1
  test('proposes only the Days that differ when several are named', () => {
    const plan = aPlanView({ days: 4 });

    const built = buildProposal(plan, [
      { dayNumber: 2, activities: plan.days[1]?.activities.map(asChange) ?? [] },
      { dayNumber: 4, activities: [asChange(activityIn(plan, 4, 0))] },
    ]);

    if (!built.ok) throw new Error(built.error);
    expect(built.days.map((day) => day.dayNumber)).toEqual([4]);
  });

  // @covers REQ-TRV-037@v1
  test('is refused for a Day the Plan does not have', () => {
    expect(buildProposal(aPlanView({ days: 3 }), [{ dayNumber: 9, activities: [NEW_ACTIVITY] }])).toEqual({ ok: false, error: 'day-not-found' });
  });

  // @covers REQ-TRV-037@v1
  test('leaves the Plan it was given exactly as it was', () => {
    const plan = aPlanWithShopping();
    const before = structuredClone(plan);

    applyProposal(plan, proposedFor(plan, 3, [asChange(activityIn(plan, 3, 0))]));

    expect(plan).toEqual(before);
  });
});
