// Playwright config for the Vault e2e smoke suite.
//
// Runs against the Vite dev server. The webServer block boots `npm run dev`
// automatically if it's not already up. Tests intercept Scryfall + EDHREC
// calls (lib/__mocks__/scryfall-fixtures.js) so they're deterministic and
// run anywhere — sandbox, CI, or your laptop offline.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail the CI run if a stray `test.only` was committed — otherwise it
  // silently narrows the suite to one test and the rest never run.
  forbidOnly: !!process.env.CI,
  // Two retries on CI absorbs the occasional dev-server-boot / first-paint
  // flake without masking a genuinely broken test (which fails all 3 times).
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5173/',
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'VITE_BASE=/ npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: true,
    timeout: 60000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
