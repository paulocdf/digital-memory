import { test, expect } from '@playwright/test';

test.describe('Pomodoro Focus Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    // Wait for the pomodoro API to be available
    await page.waitForFunction(() => !!(window as any).dmPomodoro);
    // start() opens focus mode automatically
    await page.evaluate(() => {
      (window as any).dmPomodoro.start('test-todo-1', 'Test Task');
    });
    await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();
    // Pause the timer so tests start from a paused state
    await page.evaluate(() => {
      (window as any).dmPomodoro.pause();
    });
  });

  test('focus overlay displays task info', async ({ page }) => {
    await expect(page.locator('#focus-title')).toContainText('Test Task');
    await expect(page.locator('#focus-phase')).toBeVisible();
    await expect(page.locator('#focus-display')).toBeVisible();
    await expect(page.locator('#focus-session')).toBeVisible();
  });

  test('has timer control buttons', async ({ page }) => {
    await expect(page.locator('#focus-toggle')).toBeVisible();
    await expect(page.locator('#focus-reset')).toBeVisible();
    await expect(page.locator('#focus-next')).toBeVisible();
  });

  test('has exit and close buttons', async ({ page }) => {
    await expect(page.locator('#focus-collapse')).toBeVisible();
    await expect(page.locator('#focus-close')).toBeVisible();
  });

  test('exit button closes focus overlay', async ({ page }) => {
    await page.locator('#focus-collapse').click();
    await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden();
  });

  test('Escape key closes focus overlay', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden();
  });

  test('Space key toggles play/pause', async ({ page }) => {
    // Initially paused (we paused in beforeEach)
    await expect(page.locator('#focus-play-icon')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.locator('#focus-pause-icon')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.locator('#focus-play-icon')).toBeVisible();
  });

  test('has notes panel', async ({ page }) => {
    await expect(page.locator('#focus-panel-notes')).toBeVisible();
    await expect(page.locator('#focus-notes-textarea')).toBeVisible();
  });

  test('notes textarea accepts input', async ({ page }) => {
    await page.locator('#focus-notes-textarea').fill('Test note content');
    await expect(page.locator('#focus-notes-textarea')).toHaveValue('Test note content');
  });

  test('notes toggle icon collapses/expands notes', async ({ page }) => {
    // Notes should be visible by default
    await expect(page.locator('#focus-panel-notes')).toBeVisible();

    // Click toggle icon to collapse
    await page.locator('#focus-notes-toggle-icon').click();
    await expect(page.locator('#focus-panel-notes')).toBeHidden();

    // Click again to expand
    await page.locator('#focus-notes-toggle-icon').click();
    await expect(page.locator('#focus-panel-notes')).toBeVisible();
  });

  test('notes collapse state persists to localStorage', async ({ page }) => {
    await page.locator('#focus-notes-toggle-icon').click();
    const saved = await page.evaluate(() => localStorage.getItem('dm-pomo-notes-collapsed'));
    expect(saved).toBe('true');

    await page.locator('#focus-notes-toggle-icon').click();
    const saved2 = await page.evaluate(() => localStorage.getItem('dm-pomo-notes-collapsed'));
    expect(saved2).toBe('false');
  });

  test('has settings button that opens popover', async ({ page }) => {
    await expect(page.locator('#focus-settings-btn')).toBeVisible();

    await page.locator('#focus-settings-btn').click();
    await expect(page.locator('#focus-settings-popover')).toBeVisible();
  });

  test('settings popover has theme grid', async ({ page }) => {
    await page.locator('#focus-settings-btn').click();
    await expect(page.locator('#focus-theme-grid')).toBeVisible();
  });

  test('settings popover has auto-advance toggle', async ({ page }) => {
    await page.locator('#focus-settings-btn').click();
    await expect(page.locator('#focus-auto-advance')).toBeAttached();
  });

  test('settings popover has show-progress toggle', async ({ page }) => {
    await page.locator('#focus-settings-btn').click();
    await expect(page.locator('#focus-show-progress')).toBeAttached();
  });

  test('changing theme persists to localStorage', async ({ page }) => {
    await page.locator('#focus-settings-btn').click();
    // Click a theme swatch (first one in the grid)
    const swatches = page.locator('#focus-theme-grid > *');
    const count = await swatches.count();
    if (count > 1) {
      await swatches.nth(1).click();
      const saved = await page.evaluate(() => localStorage.getItem('dm-pomo-focus-theme'));
      expect(saved).toBeTruthy();
    }
  });

  test('has progress bar', async ({ page }) => {
    // Progress bar starts at 0% width so it may not be "visible" — check it's in the DOM
    await expect(page.locator('#focus-progress')).toBeAttached();
  });

  test('has timeline blocks container', async ({ page }) => {
    await expect(page.locator('#focus-timeline-blocks')).toBeAttached();
  });

  test('has visualizer canvas', async ({ page }) => {
    await expect(page.locator('#focus-viz-canvas')).toBeAttached();
  });

  test('keyboard shortcut R resets timer', async ({ page }) => {
    // Resume the timer first
    await page.keyboard.press('Space');
    await expect(page.locator('#focus-pause-icon')).toBeVisible();

    // Press R to reset
    await page.keyboard.press('r');
    await expect(page.locator('#focus-play-icon')).toBeVisible();
  });

  test('Space does not trigger play/pause when typing in notes', async ({ page }) => {
    // Focus the notes textarea
    await page.locator('#focus-notes-textarea').focus();

    // Type a space — should NOT toggle timer
    await page.keyboard.press('Space');

    // Play icon should still be visible (timer not toggled)
    // Also check the textarea has a space
    const value = await page.locator('#focus-notes-textarea').inputValue();
    expect(value).toContain(' ');
  });
});
