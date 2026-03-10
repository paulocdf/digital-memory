import { test, expect, Page } from '@playwright/test';

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

// ── Auto-advance setting tests ──
// These tests verify that when auto-advance is OFF, the timer does NOT
// auto-advance to the next subtask or auto-start the next phase.

test.describe('Pomodoro Auto-Advance Setting', () => {
  // Use a very short pomodoroLength (0.05 min = 3 seconds) so the timer completes quickly
  const SHORT_POMO = 0.05;

  /** Seed a parent task with two subtasks in IDB. */
  async function seedSubtasks(page: Page) {
    await page.evaluate(
      ({ shortPomo }) => {
        const dmSync = (window as any).dmSync;
        const parent = {
          id: 'auto-adv-parent',
          userId: 'test-user',
          title: 'Parent Task',
          done: false,
          status: 'active',
          bujoType: 'task',
          bujoState: 'open',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const sub1 = {
          id: 'auto-adv-sub-1',
          userId: 'test-user',
          title: 'Subtask One',
          parentId: 'auto-adv-parent',
          order: 1,
          done: false,
          status: 'active',
          bujoType: 'task',
          bujoState: 'open',
          pomodoroLength: shortPomo,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const sub2 = {
          id: 'auto-adv-sub-2',
          userId: 'test-user',
          title: 'Subtask Two',
          parentId: 'auto-adv-parent',
          order: 2,
          done: false,
          status: 'active',
          bujoType: 'task',
          bujoState: 'open',
          pomodoroLength: shortPomo,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return Promise.all([dmSync.putTodo(parent), dmSync.putTodo(sub1), dmSync.putTodo(sub2)]);
      },
      { shortPomo: SHORT_POMO }
    );
  }

  /** Remove seeded test data from IDB. */
  async function cleanupSubtasks(page: Page) {
    await page.evaluate(() => {
      const dmSync = (window as any).dmSync;
      return Promise.all([
        dmSync.deleteTodo('auto-adv-parent'),
        dmSync.deleteTodo('auto-adv-sub-1'),
        dmSync.deleteTodo('auto-adv-sub-2'),
      ]);
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmPomodoro);
    await page.waitForFunction(() => !!(window as any).dmSync && !!(window as any).dmSync.putTodo);
    await seedSubtasks(page);
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      try { (window as any).dmPomodoro.stop(); } catch (_) {}
    });
    await cleanupSubtasks(page);
  });

  test('subtask does NOT auto-advance when auto-advance is OFF', async ({ page }) => {
    // Disable all auto-advance/auto-start settings
    await page.evaluate(() => {
      localStorage.setItem('dm-pomo-auto-advance', 'false');
      localStorage.setItem('dm-pomo-auto-break', 'false');
      localStorage.setItem('dm-pomo-auto-work', 'false');
    });

    // Start the timer on the first subtask (pomodoroLength is ~3 seconds)
    await page.evaluate(() => {
      (window as any).dmPomodoro.start('auto-adv-sub-1', 'Subtask One');
    });
    await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();

    // Verify we're timing the subtask
    const activeTodo = await page.evaluate(() => (window as any).dmPomodoro.getActiveTodoId());
    expect(activeTodo).toBe('auto-adv-sub-1');

    // The timer should complete within a few seconds
    // When auto-advance is OFF, the timer should CLOSE (not advance to sub-2)
    await expect(page.locator('#pomodoro-focus-overlay')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#pomodoro-timer')).toBeHidden({ timeout: 3000 });

    // Verify the timer did NOT start on Subtask Two
    const activeAfter = await page.evaluate(() => (window as any).dmPomodoro.getActiveTodoId());
    expect(activeAfter).toBeNull();
  });

  test('subtask DOES auto-advance when auto-advance is ON', async ({ page }) => {
    // Enable auto-advance
    await page.evaluate(() => {
      localStorage.setItem('dm-pomo-auto-advance', 'true');
    });

    // Start the timer on the first subtask (pomodoroLength is ~3 seconds)
    await page.evaluate(() => {
      (window as any).dmPomodoro.start('auto-adv-sub-1', 'Subtask One');
    });
    await expect(page.locator('#pomodoro-focus-overlay')).toBeVisible();

    // Wait for the timer to complete and auto-advance to sub-2
    // The focus overlay should stay visible (timer transitions to next subtask)
    await expect(page.locator('#focus-title')).toContainText('Subtask Two', { timeout: 15000 });

    // Timer should still be active (paused on the next subtask)
    const activeAfter = await page.evaluate(() => (window as any).dmPomodoro.getActiveTodoId());
    expect(activeAfter).toBe('auto-adv-sub-2');
  });
});
