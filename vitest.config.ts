import { defineConfig } from 'vitest/config';

/** A timing test is only meaningful when nothing else is using the machine, so it runs on its own, after everything else. */
const TIMING_TESTS = ['tests/api/performance.http.spec.ts'];

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/server/main.ts'],
      thresholds: { lines: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'tests',
          include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
          exclude: TIMING_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'timing',
          include: TIMING_TESTS,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
