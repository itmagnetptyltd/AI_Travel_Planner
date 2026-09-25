import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { scheduleTextPurge } from '../../src/server/plans/ai-record-service';

const HOUR = 60 * 60 * 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('clearing expired AI text on a schedule', () => {
  // @covers REQ-TRV-034@v1
  test('clears expired text as soon as it is scheduled, and again every interval', () => {
    const purgeExpiredText = vi.fn(() => 0);

    scheduleTextPurge({ purgeExpiredText }, HOUR, () => undefined);
    expect(purgeExpiredText).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3 * HOUR);
    expect(purgeExpiredText).toHaveBeenCalledTimes(4);
  });

  // @covers REQ-TRV-034@v1
  test('stops clearing once stopped', () => {
    const purgeExpiredText = vi.fn(() => 0);
    const stop = scheduleTextPurge({ purgeExpiredText }, HOUR, () => undefined);

    stop();
    vi.advanceTimersByTime(5 * HOUR);

    expect(purgeExpiredText).toHaveBeenCalledTimes(1);
  });

  // @covers REQ-TRV-034@v1
  test('reports a failed clearing instead of throwing, and tries again at the next interval', () => {
    const failure = new Error('database is locked');
    const purgeExpiredText = vi.fn().mockImplementationOnce(() => {
      throw failure;
    }).mockReturnValue(0);
    const onError = vi.fn();

    scheduleTextPurge({ purgeExpiredText }, HOUR, onError);
    vi.advanceTimersByTime(HOUR);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(purgeExpiredText).toHaveBeenCalledTimes(2);
  });
});
