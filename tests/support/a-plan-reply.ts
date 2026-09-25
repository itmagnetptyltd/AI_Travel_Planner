import type { ActivityCategory } from '../../src/shared/plan-schemas';

export interface AnActivity {
  readonly title: string;
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly estimatedCost: number;
  readonly location: string;
  readonly reason: string;
  readonly category: ActivityCategory;
}

export interface ADay {
  readonly dayNumber: number;
  readonly activities: readonly Partial<AnActivity>[];
}

export interface AStay {
  readonly accommodationType: string;
  readonly suggestedArea: string;
  readonly nightlyCostEstimate: number;
}

export function anActivity(overrides: Partial<AnActivity> = {}): AnActivity {
  return {
    title: 'Visit Senso-ji Temple',
    startTime: '09:00',
    durationMinutes: 90,
    estimatedCost: 0,
    location: 'Asakusa',
    reason: 'The oldest temple in Tokyo, best seen early before the crowds.',
    category: 'Activities',
    ...overrides,
  };
}

export function aStay(overrides: Partial<AStay> = {}): AStay {
  return { accommodationType: 'Hotel', suggestedArea: 'Shinjuku', nightlyCostEstimate: 150, ...overrides };
}

/** The JSON text an AI would send back: `dayCount` Days of three Activities each, unless told otherwise. */
export function aPlanReplyText(
  options: { readonly dayCount?: number; readonly days?: readonly ADay[]; readonly stay?: Partial<AStay> | null } = {},
): string {
  const days =
    options.days ??
    Array.from({ length: options.dayCount ?? 8 }, (_, index) => ({
      dayNumber: index + 1,
      activities: [
        anActivity({ startTime: '09:00' }),
        anActivity({ title: 'Lunch at a ramen counter', startTime: '12:30', category: 'Food', estimatedCost: 12 }),
        anActivity({ title: 'Evening walk', startTime: '18:00' }),
      ],
    }));
  const filled = days.map((day) => ({ dayNumber: day.dayNumber, activities: day.activities.map((a) => anActivity(a)) }));
  return JSON.stringify({ days: filled, ...(options.stay === null ? {} : { stay: aStay(options.stay ?? {}) }) });
}
