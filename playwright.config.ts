import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
export const E2E_OUTBOX_DIR = '.e2e/outbox';
/** The Administrator the installation seed step creates before the server starts. */
export const SEEDED_ADMIN_EMAIL = 'admin@example.com';
export const SEEDED_ADMIN_PASSWORD = 'harbour-lantern-amber-admin'; // itm-sdlc:allow-secret - synthetic test password

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
    command: `npm run build:web && node e2e/support/reset-e2e-state.mjs && tsx scripts/seed-administrator.ts ${SEEDED_ADMIN_EMAIL} && tsx src/server/main.ts`,
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
      SEED_ADMIN_PASSWORD: SEEDED_ADMIN_PASSWORD,
    },
  },
});
