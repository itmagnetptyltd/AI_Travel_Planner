import { describe, expect, it } from 'vitest';
import { busyText, generationProgressText } from '../../src/web/components/plan-progress';

describe('what the page says while a Plan is being generated', () => {
  // @covers REQ-TRV-080@v1
  it.each([
    [0, 'Generating your Plan… 0 seconds so far. This can take up to two minutes.'],
    [999, 'Generating your Plan… 0 seconds so far. This can take up to two minutes.'],
    [1_000, 'Generating your Plan… 1 second so far. This can take up to two minutes.'],
    [7_400, 'Generating your Plan… 7 seconds so far. This can take up to two minutes.'],
    [61_000, 'Generating your Plan… 61 seconds so far. This can take up to two minutes.'],
    [119_999, 'Generating your Plan… 119 seconds so far. This can take up to two minutes.'],
  ])('says, after %i ms, %j', (elapsedMs, expected) => {
    expect(generationProgressText(elapsedMs)).toBe(expected);
  });

  // @covers REQ-TRV-080@v1
  it('never says a negative or odd number of seconds when the clock is wrong', () => {
    expect(generationProgressText(-5_000)).toContain('0 seconds so far');
    expect(generationProgressText(Number.NaN)).toContain('0 seconds so far');
  });

  // @covers REQ-TRV-080@v1
  it('words the other slow requests the same way, and a restore without a count of seconds', () => {
    expect(busyText('regenerating-day', 12_000)).toBe('Generating that Day… 12 seconds so far. This can take up to two minutes.');
    expect(busyText('generating', 3_000)).toBe(generationProgressText(3_000));
    expect(busyText('restoring', 9_000)).toBe('Restoring that version…');
  });
});
