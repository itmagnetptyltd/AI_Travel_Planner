import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
export const E2E_OUTBOX_DIR = '.e2e/outbox';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:web && node e2e/support/reset-e2e-state.mjs && tsx src/server/main.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      APP_BASE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PATH: '.e2e/trv-e2e.sqlite',
      EMAIL_TRANSPORT: 'file',
      EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
      EMAIL_FROM: 'no-reply@example.test',
      COOKIE_SECURE: 'false',
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    },
  },
});
