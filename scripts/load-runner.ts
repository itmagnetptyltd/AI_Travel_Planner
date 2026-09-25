// Measuring how the application answers under load (REQ-TRV-080). No dependencies: it is used by the load-test command
// and by the automated test that runs 25 simultaneous users against the application on this machine.

/** One request that was made: what it was, how long it took, and whether the answer was a success. */
export interface Sample {
  readonly name: string;
  readonly ms: number;
  readonly ok: boolean;
  readonly status?: number;
  /** Why a request that got no answer at all failed. */
  readonly reason?: string;
}

export interface LoadSummary {
  readonly requests: number;
  readonly failures: readonly Sample[];
  readonly p95Ms: number;
  readonly slowest: Sample;
}

/** The smallest time that at least `percent` per cent of the times do not exceed (nearest rank). */
export function percentile(times: readonly number[], percent: number): number {
  if (times.length === 0) throw new Error('There are no response times to take a percentile of.');
  if (!(percent > 0 && percent <= 100)) throw new Error(`The percent must be above 0 and at most 100, not ${percent}.`);
  const sorted = [...times].sort((a, b) => a - b);
  const rank = Math.ceil((percent / 100) * sorted.length);
  return sorted[rank - 1] ?? Number.NaN;
}

/** What a run came to. A request that failed counts in the times as well as in the failures, so failing slowly cannot look fast. */
export function summarise(samples: readonly Sample[]): LoadSummary {
  const slowest = samples.reduce((worst, sample) => (sample.ms > worst.ms ? sample : worst), samples[0] ?? { name: '', ms: 0, ok: true });
  return {
    requests: samples.length,
    failures: samples.filter((sample) => !sample.ok),
    p95Ms: percentile(samples.map((sample) => sample.ms), 95),
    slowest,
  };
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Makes one request and times it, until its answer has been read in full. Only a 2xx answer is a success. */
export async function timed(name: string, request: () => Promise<{ readonly status: number }>): Promise<Sample> {
  const startedAt = performance.now();
  try {
    const { status } = await request();
    return { name, ms: performance.now() - startedAt, ok: status >= 200 && status < 300, status };
  } catch (error) {
    return { name, ms: performance.now() - startedAt, ok: false, reason: reasonOf(error) };
  }
}

/** Runs `users` journeys at the same time, each told which user it is, and gathers everything they timed. */
export async function runUsers(users: number, journey: (user: number) => Promise<readonly Sample[]>): Promise<Sample[]> {
  const journeys = Array.from({ length: users }, async (_value, user): Promise<readonly Sample[]> => {
    try {
      return await journey(user);
    } catch (error) {
      return [{ name: `journey of user ${user}`, ms: 0, ok: false, reason: reasonOf(error) }];
    }
  });
  return (await Promise.all(journeys)).flat();
}
