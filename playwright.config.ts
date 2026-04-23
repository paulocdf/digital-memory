import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: process.env.CI ? 30_000 : 45_000,

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
        // Auth & navigation
        'auth-persistence.spec.ts',
        'auth-login-flows.spec.ts',
        'landing-page.spec.ts',
        'navigation.spec.ts',
        'sidebar.spec.ts',
        // Core features
        'review.spec.ts',
        'pomodoro-timer.spec.ts',
        'quick-capture.spec.ts',
        'inbox-tasks.spec.ts',
        'notes-crud.spec.ts',
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
