import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:1313/digital-memory/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    // Lightweight smoke suite for CI — critical paths only.
    // Run locally with: npx playwright test --project=ci
    // Full suite still available via: npx playwright test --project=chromium
    {
      name: 'ci',
      use: { browserName: 'chromium' },
      testMatch: [
        'auth-persistence.spec.ts',
        'auth-login-flows.spec.ts',
        'landing-page.spec.ts',
        'navigation.spec.ts',
        'sidebar.spec.ts',
      ],
    },
  ],

  webServer: {
    command: 'hugo server -D --port 1313',
    url: 'http://localhost:1313/digital-memory/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
