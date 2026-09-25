import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { scheduleReminderChecks } from '../../src/server/notifications/reminder-service';

const EVERY = 1_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the schedule the reminder check runs on', () => {
  // @covers REQ-TRV-057@v1
  test('runs the check at once and then every interval, by itself, with nobody asking', async () => {
    const check = vi.fn(async () => 0);
    const schedule = scheduleReminderChecks(check, EVERY, () => undefined);

    await vi.advanceTimersByTimeAsync(3 * EVERY);

    expect(check).toHaveBeenCalledTimes(4);
    await schedule.stop();
  });

  // @covers REQ-TRV-057@v1
  test('never starts a check while the last one is still running', async () => {
    let finish: () => void = () => undefined;
    const check = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const schedule = scheduleReminderChecks(check, EVERY, () => undefined);

    await vi.advanceTimersByTimeAsync(5 * EVERY);
    expect(check).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(EVERY);

    expect(check).toHaveBeenCalledTimes(2);
    finish();
    await schedule.stop();
  });

  // @covers REQ-TRV-057@v1
  test('reports a check that fails and carries on with the next', async () => {
    const problems: unknown[] = [];
    const check = vi.fn().mockRejectedValueOnce(new Error('the database is busy')).mockResolvedValue(0);
    const schedule = scheduleReminderChecks(check, EVERY, (error) => problems.push(error));

    await vi.advanceTimersByTimeAsync(EVERY);

    expect(problems).toHaveLength(1);
    expect(check).toHaveBeenCalledTimes(2);
    await schedule.stop();
  });

  // @covers REQ-TRV-057@v1
  test('stops, waiting for a check that is running, and starts no more', async () => {
    let finish: () => void = () => undefined;
    let isFinished = false;
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            isFinished = true;
            resolve();
          };
        }),
    );
    const schedule = scheduleReminderChecks(check, EVERY, () => undefined);

    const stopping = schedule.stop();
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(isFinished).toBe(false);
    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * EVERY);

    expect(isFinished).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
