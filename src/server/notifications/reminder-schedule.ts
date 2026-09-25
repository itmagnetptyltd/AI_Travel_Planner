/** ANSWERS.md, "Reminder timing": one reminder, three days before the start, at 09:00 in the configured timezone. */
export const REMINDER_DAYS_BEFORE = 3;
export const REMINDER_HOUR = 9;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far `timeZone` is ahead of UTC at `at`, in minutes. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: string): number => Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return Math.round((asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` reads this date and hour. The offset is worked out twice, so a
 * date on which the clocks change in the same zone still lands on the right instant.
 */
function localToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour);
  const firstGuess = wallClockAsUtc - offsetMinutes(new Date(wallClockAsUtc), timeZone) * 60_000;
  return new Date(wallClockAsUtc - offsetMinutes(new Date(firstGuess), timeZone) * 60_000);
}

const partsOf = (isoDate: string): readonly [number, number, number] => {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return [year, month, day];
};

/** 09:00 in `timeZone`, three calendar days before the start date. */
export function reminderPoint(startDate: string, timeZone: string): Date {
  const [year, month, day] = partsOf(startDate);
  const before = new Date(Date.UTC(year, month - 1, day) - REMINDER_DAYS_BEFORE * DAY_MS);
  return localToUtc(before.getUTCFullYear(), before.getUTCMonth() + 1, before.getUTCDate(), REMINDER_HOUR, timeZone);
}

/** The instant the start date begins in `timeZone`. */
export function startOfTrip(startDate: string, timeZone: string): Date {
  const [year, month, day] = partsOf(startDate);
  return localToUtc(year, month, day, 0, timeZone);
}

/**
 * Whether a Trip's reminder is due now: its point has passed, it has not started, it has not already been sent, and the
 * Trip existed at the point. A Trip made less than three days before it starts is never due (ANSWERS.md). A check that
 * runs late, because the application was down at 09:00, still sends, but never after the Trip has begun.
 */
export function isReminderDue(input: {
  readonly trip: { readonly startDate: string; readonly createdAt: Date; readonly reminderSentAt: Date | null };
  readonly timeZone: string;
  readonly now: Date;
}): boolean {
  const { trip, timeZone, now } = input;
  if (trip.reminderSentAt !== null) return false;
  const point = reminderPoint(trip.startDate, timeZone);
  return trip.createdAt.getTime() <= point.getTime() && now.getTime() >= point.getTime() && now.getTime() < startOfTrip(trip.startDate, timeZone).getTime();
}
