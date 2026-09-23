import type { Clock } from '../../src/server/clock';

export interface FixedClock extends Clock {
  advanceBy(milliseconds: number): void;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function aFixedClock(start = new Date('2026-10-01T09:00:00Z')): FixedClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advanceBy: (milliseconds) => {
      current += milliseconds;
    },
  };
}
