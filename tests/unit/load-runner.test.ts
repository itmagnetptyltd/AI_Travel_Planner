import { describe, expect, it } from 'vitest';
import { refusalForTarget } from '../../scripts/load-journey';
import { percentile, runUsers, summarise, timed, type Sample } from '../../scripts/load-runner';

const sample = (ms: number, overrides: Partial<Sample> = {}): Sample => ({ name: 'GET /', ms, ok: true, ...overrides });

describe('the 95th percentile of response times', () => {
  // @covers REQ-TRV-080@v1
  it('is the smallest time that at least 95% of the times do not exceed (nearest rank)', () => {
    const times = Array.from({ length: 100 }, (_value, index) => index + 1);

    expect(percentile(times, 95)).toBe(95);
    expect(percentile(times, 100)).toBe(100);
    expect(percentile(times, 50)).toBe(50);
  });

  // @covers REQ-TRV-080@v1
  it('does not depend on the order the times arrive in, and leaves the times it was given as they were', () => {
    const times = [900, 100, 500, 300, 700];

    expect(percentile(times, 95)).toBe(900);
    expect(percentile(times, 40)).toBe(300);
    expect(times).toEqual([900, 100, 500, 300, 700]);
  });

  // @covers REQ-TRV-080@v1
  it('is the one time there is when there is only one', () => {
    expect(percentile([1234], 95)).toBe(1234);
  });

  // @covers REQ-TRV-080@v1
  it('is refused for no times at all, rather than reported as fast', () => {
    expect(() => percentile([], 95)).toThrow(/no response times/i);
  });

  // @covers REQ-TRV-080@v1
  it.each([0, -1, 101, Number.NaN])('is refused for the percentage %s', (percent) => {
    expect(() => percentile([1, 2, 3], percent)).toThrow(/percent/i);
  });
});

describe('what a run of simultaneous users came to', () => {
  // @covers REQ-TRV-080@v1
  it('counts the requests, names the ones that failed, and gives the 95th percentile of all of them', () => {
    const failed = sample(9_000, { name: 'GET /api/trips', ok: false, status: 500 });
    const samples = [...Array.from({ length: 19 }, (_value, index) => sample(100 + index)), failed];

    const summary = summarise(samples);

    expect(summary.requests).toBe(20);
    expect(summary.failures).toEqual([failed]);
    expect(summary.p95Ms).toBe(118);
    expect(summary.slowest.ms).toBe(9_000);
  });

  // @covers REQ-TRV-080@v1
  it('counts a slow failure in the times, so a server that fails slowly cannot look fast', () => {
    const summary = summarise([sample(50), sample(60), sample(30_000, { ok: false })]);

    expect(summary.p95Ms).toBe(30_000);
  });
});

describe('timing one request', () => {
  // @covers REQ-TRV-080@v1
  it('records how long it took and whether the answer was a success', async () => {
    const result = await timed('GET /api/trips', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { status: 200 };
    });

    expect(result).toMatchObject({ name: 'GET /api/trips', ok: true, status: 200 });
    expect(result.ms).toBeGreaterThanOrEqual(25);
  });

  // @covers REQ-TRV-080@v1
  it.each([500, 503, 429, 404])('records a %s as a failure', async (status) => {
    expect((await timed('GET /', async () => ({ status }))).ok).toBe(false);
  });

  // @covers REQ-TRV-080@v1
  it('records a request that could not be made at all as a failure, with the time it took to fail', async () => {
    const result = await timed('GET /', async () => {
      throw new Error('connection refused');
    });

    expect(result).toMatchObject({ name: 'GET /', ok: false, reason: 'connection refused' });
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });
});

describe('running users at the same time', () => {
  // @covers REQ-TRV-080@v1
  it('starts every user before any of them finishes, so they really are simultaneous', async () => {
    let started = 0;
    let everyoneStarted: () => void = () => undefined;
    const allStarted = new Promise<void>((resolve) => {
      everyoneStarted = resolve;
    });

    const samples = await runUsers(25, async (user) => {
      started += 1;
      if (started === 25) everyoneStarted();
      await allStarted;
      return [sample(10 + user)];
    });

    expect(started).toBe(25);
    expect(samples).toHaveLength(25);
  });

  // @covers REQ-TRV-080@v1
  it('gathers what every user did, in one list, and tells each user which one they are', async () => {
    const samples = await runUsers(3, async (user) => [sample(user, { name: `user ${user} a` }), sample(user, { name: `user ${user} b` })]);

    expect(samples.map((entry) => entry.name).sort()).toEqual(['user 0 a', 'user 0 b', 'user 1 a', 'user 1 b', 'user 2 a', 'user 2 b']);
  });

  // @covers REQ-TRV-080@v1
  it('counts a user whose whole journey broke as a failure, and still gathers the others', async () => {
    const samples = await runUsers(3, async (user) => {
      if (user === 1) throw new Error('the journey broke');
      return [sample(20)];
    });

    expect(samples.filter((entry) => !entry.ok)).toMatchObject([{ reason: 'the journey broke' }]);
    expect(samples.filter((entry) => entry.ok)).toHaveLength(2);
  });
});

describe('the address a load test may be pointed at', () => {
  // @covers REQ-TRV-080@v1
  it.each(['https://demo.example.com', 'https://demo.example.com:8443', 'http://localhost:3000', 'http://127.0.0.1:5174', 'http://[::1]:3000'])('accepts %s', (address) => {
    expect(refusalForTarget(address)).toBeNull();
  });

  // @covers REQ-TRV-080@v1
  it.each([
    ['http://demo.example.com', /https/i],
    ['ftp://demo.example.com', /https/i],
    ['demo.example.com', /address/i],
    ['', /address/i],
  ])('refuses %j, because a password and a session must not cross a network unprotected or go to an address that is not one', (address, reason) => {
    expect(refusalForTarget(address)).toMatch(reason);
  });
});
