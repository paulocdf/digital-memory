import { chromium, FullConfig } from '@playwright/test';

/**
 * Pre-warms Hugo's on-demand renderer by visiting the most common routes once
 * before any test workers start. On a cold `hugo server`, each worker would
 * otherwise pay a 3–5 s rebuild cost the first time it requests a given page.
 *
 * This is a best-effort optimisation: failures here are logged but do not
 * abort the test run.
 */
export default async function globalSetup(_config: FullConfig) {
  const base = 'http://localhost:1313/digital-memory/';
  const paths = [
    '',                    // landing
    'docs/inbox/',         // inbox
    'docs/board/',         // kanban
    'docs/review/',        // spaced repetition
    'docs/dashboard/',     // analytics
    'docs/ai/',            // ai chat
    'docs/history/',       // calendar
    'docs/tags/',          // tag cloud
    'docs/trash/',         // trash
    'docs/projects/',      // projects
  ];

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (const p of paths) {
      try {
        await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      } catch (err) {
        // Non-fatal — some routes may not exist yet.
        // eslint-disable-next-line no-console
        console.warn(`[globalSetup] prewarm failed for ${p}:`, (err as Error).message);
      }
    }
  } finally {
    await page.close();
    await ctx.close();
    await browser.close();
  }
}
