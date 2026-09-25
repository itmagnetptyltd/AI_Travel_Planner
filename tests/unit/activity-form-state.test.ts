import { describe, expect, test } from 'vitest';
import {
  changesMade,
  EMPTY_ACTIVITY_FORM,
  newActivityPayload,
  problemWith,
  valuesFromActivity,
  type ActivityFormValues,
} from '../../src/web/components/activity-form-state';
import type { PlanActivity } from '../../src/shared/plan-schemas';

const AN_ACTIVITY: PlanActivity = {
  id: 'a1',
  title: 'Visit Senso-ji Temple',
  startTime: '10:00',
  durationMinutes: 90,
  estimatedCost: 0,
  location: 'Asakusa',
  reason: 'The oldest temple in Tokyo.',
  category: 'Activities',
  changedByHand: false,
};

describe('the form for one Activity', () => {
  // @covers REQ-TRV-045@v1
  test('starts from what the Activity is now, as text', () => {
    expect(valuesFromActivity(AN_ACTIVITY)).toEqual({
      title: 'Visit Senso-ji Temple',
      startTime: '10:00',
      durationMinutes: '90',
      estimatedCost: '0',
      location: 'Asakusa',
    });
  });

  // @covers REQ-TRV-045@v1
  test('sends only what the Traveler changed: a start time moved from 10:00 to 11:00', () => {
    const values: ActivityFormValues = { ...valuesFromActivity(AN_ACTIVITY), startTime: '11:00' };

    expect(changesMade(valuesFromActivity(AN_ACTIVITY), values)).toEqual({ startTime: '11:00' });
  });

  // @covers REQ-TRV-045@v1
  test('sends numbers as numbers, and sends nothing when nothing changed', () => {
    const original = valuesFromActivity(AN_ACTIVITY);

    expect(changesMade(original, { ...original, durationMinutes: '120', estimatedCost: '15' })).toEqual({ durationMinutes: 120, estimatedCost: 15 });
    expect(changesMade(original, original)).toEqual({});
  });

  // @covers REQ-TRV-045@v1
  test('sends a field the Traveler blanked as it was typed, so the server names it instead of the form guessing a value', () => {
    const original = valuesFromActivity(AN_ACTIVITY);

    expect(changesMade(original, { ...original, durationMinutes: '  ', title: '' })).toEqual({ title: '', durationMinutes: '  ' });
  });

  // @covers REQ-TRV-047@v1
  test('makes a typed Activity from a start time, a duration, a location and a cost', () => {
    const typed: ActivityFormValues = { title: 'Sunrise swim', startTime: '06:30', durationMinutes: '45', estimatedCost: '0', location: 'Kamo river' };

    expect(newActivityPayload(typed)).toEqual({ title: 'Sunrise swim', startTime: '06:30', durationMinutes: 45, estimatedCost: 0, location: 'Kamo river' });
  });

  // @covers REQ-TRV-047@v1
  test('leaves a blank field of a typed Activity out, so the server names it', () => {
    expect(newActivityPayload(EMPTY_ACTIVITY_FORM)).toEqual({});
  });

  // @covers REQ-TRV-047@v1
  test('marks an accepted AI suggestion, so it is not counted as the Traveler own work', () => {
    const suggestion = { ...AN_ACTIVITY, title: 'Tea ceremony' };

    expect(newActivityPayload(valuesFromActivity(suggestion), { fromSuggestion: true, reason: suggestion.reason })).toMatchObject({
      title: 'Tea ceremony',
      fromSuggestion: true,
      reason: 'The oldest temple in Tokyo.',
    });
  });
});

describe('a problem the server found in an Activity', () => {
  // @covers REQ-TRV-045@v1
  test.each([
    ['startTime', 'Check the start time. Use 24-hour HH:MM, for example 14:30.'],
    ['title', 'Check the title.'],
    ['durationMinutes', 'Check the duration in minutes.'],
    ['estimatedCost', 'Check the estimated cost. Use a whole number.'],
    ['location', 'Check the location.'],
  ])('names %s for the Traveler', (field, message) => {
    expect(problemWith({ code: 'VALIDATION_FAILED', field })).toBe(message);
  });

  test('gives a plain message when the server names nothing', () => {
    expect(problemWith({ code: 'UNKNOWN' })).toMatch(/try again/i);
  });

  test('gives the server message when it is the AI that is unavailable or the limit is reached', () => {
    expect(problemWith({ code: 'AI_UNAVAILABLE', message: 'The AI planner is unavailable right now.' })).toBe('The AI planner is unavailable right now.');
    expect(problemWith({ code: 'PLAN_LIMIT_REACHED', message: 'You have reached today limit. It resets at 00:00 UTC.' })).toContain('resets at 00:00 UTC');
  });
});
