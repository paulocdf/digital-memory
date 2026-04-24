import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI runs on free GitHub Actions (weak runners) so keep retries there;
  // locally 1 retry absorbs occasional contention flakes under high worker
  // parallelism without masking real bugs.
  retries: process.env.CI ? 2 : 1,
  // CI: workers:1 (free runner memory constraints). Local: 4 workers — a
  // sweet spot between throughput and IDB/network contention. Earlier runs
  // with auto (≥8) produced sporadic flakes in IDB-heavy review.spec.ts.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: process.env.CI ? 30_000 : 45_000,
  // Runs once before any tests; warms Hugo's on-demand renderer so the first
  // test workers don't each pay a 3-5 s rebuild for the landing page.
  globalSetup: require.resolve('./tests/global-setup.ts'),

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
    // Fast pre-push guard: ~5 essential spec files, runs in ≤90 s on a
    // modern laptop. Used by the husky pre-push hook. Full `ci` subset
    // still runs on GitHub Actions.
    {
      name: 'pre-push',
      use: { browserName: 'chromium' },
      testMatch: [
        'navigation.spec.ts',
        'sidebar.spec.ts',
        'quick-capture.spec.ts',
        'inbox-tasks.spec.ts',
        'pomodoro-timer.spec.ts',
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
