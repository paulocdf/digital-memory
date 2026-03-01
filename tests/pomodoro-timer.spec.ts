import { test, expect } from '@playwright/test';

// Helper: start the pomodoro timer programmatically and exit focus mode
// so the compact floating widget is visible
async function startTimerWidget(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    (window as any).dmPomodoro.start('test-todo-1', 'Test Task');
  });
  // start() opens focus mode; exit to show the compact widget
  await page.locator('#focus-collapse').click();
  await expect(page.locator('#pomodoro-timer')).toBeVisible();
}

test.describe('Pomodoro Timer Widget', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    // Wait for the pomodoro API to be available
    await page.waitForFunction(() => !!(window as any).dmPomodoro);
    await startTimerWidget(page);
  });

  test('compact timer widget is visible when started', async ({ page }) => {
    await expect(page.locator('#pomodoro-timer')).toBeVisible();
  });

  test('displays task title', async ({ page }) => {
    await expect(page.locator('#pomodoro-title')).toContainText('Test Task');
  });

  test('displays time', async ({ page }) => {
    await expect(page.locator('#pomodoro-display')).toBeVisible();
    // Should show remaining time in MM:SS format
    const text = await page.locator('#pomodoro-display').textContent();
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  test('displays phase label', async ({ page }) => {
    await expect(page.locator('#pomodoro-phase')).toBeVisible();
  });

  test('displays session info', async ({ page }) => {
    await expect(page.locator('#pomodoro-session')).toBeVisible();
  });

  test('has play/pause toggle button', async ({ page }) => {
    await expect(page.locator('#pomodoro-toggle')).toBeVisible();
  });

  test('has reset button', async ({ page }) => {
    await expect(page.locator('#pomodoro-reset')).toBeVisible();
  });

  test('has next/complete button', async ({ page }) => {
    await expect(page.locator('#pomodoro-next')).toBeVisible();
  });

  test('has focus mode expand button', async ({ page }) => {
    await expect(page.locator('#pomodoro-expand')).toBeVisible();
  });

  test('has close button', async ({ page }) => {
    await expect(page.locator('#pomodoro-close')).toBeVisible();
  });

  test('has progress bar', async ({ page }) => {
    await expect(page.locator('#pomodoro-progress')).toBeVisible();
  });

  test('play button toggles to pause icon when clicked', async ({ page }) => {
    // Timer is already running after start(), so pause icon should be visible
    // Pause it first
    await page.locator('#pomodoro-toggle').click();
    await expect(page.locator('#pomodoro-play-icon')).toBeVisible();

    // Click again to resume
    await page.locator('#pomodoro-toggle').click();
    await expect(page.locator('#pomodoro-pause-icon')).toBeVisible();
  });

  test('clicking focus mode button opens focus overlay', async ({ page }) => {
    await page.locator('#pomodoro-expand').click();
    await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();
  });
});
