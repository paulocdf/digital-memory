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

test.describe('Pomodoro Timer — prior progress preserved across edits', () => {
  test('editing pomodoroCount after starting preserves accumulated sessions', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmPomodoro && !!(window as any).dmSync);

    const TODO_ID = 'edit-pomo-test-1';

    // Seed a todo that was originally 2 pomos (user has completed 1) and
    // simulate the user editing it to 4 pomos AFTER starting.
    await page.evaluate(async (todoId) => {
      const dmSync = (window as any).dmSync;
      await dmSync.putTodo({
        id: todoId,
        userId: 'test-user',
        title: 'Edited Pomos Task',
        pomodoroCount: 4,      // edited value (was 2 originally)
        pomodoroLength: 25,
        breakLength: 5,
        done: false,
        status: 'active',
        bujoType: 'task',
        bujoState: 'open',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // Seed prior progress reflecting the pre-edit totalSessions of 2
      // with 1 session already completed (25 min of work accumulated).
      localStorage.setItem('dm-pomodoro-progress', JSON.stringify({
        [todoId]: {
          sessionsCompleted: 1,
          accWorkSeconds: 1500, // 25 min
          totalSessions: 2,     // pre-edit value — differs from new 4
          workSeconds: 1500,
          breakSeconds: 300,
          remainingSeconds: 1500,
          savedAt: Date.now(),
        },
      }));
    }, TODO_ID);

    // Start the timer — initAndStart() should now restore prior progress
    // even though totalSessions changed from 2 → 4.
    await page.evaluate((todoId) => {
      (window as any).dmPomodoro.start(todoId, 'Edited Pomos Task');
    }, TODO_ID);

    // Wait for async getTodo → initAndStart chain to complete
    await page.waitForFunction(() => {
      const dmP = (window as any).dmPomodoro;
      return dmP.getSessionInfo().total === 4 && dmP.isTimerRunning();
    });

    const info = await page.evaluate(() => (window as any).dmPomodoro.getSessionInfo());
    // Should be on session 2 of 4 (1 prior session preserved), NOT session 1 of 4.
    expect(info.total).toBe(4);
    expect(info.current).toBe(2);

    // Cleanup
    await page.evaluate(async (todoId) => {
      await (window as any).dmSync.deleteTodo(todoId);
      (window as any).dmPomodoro.clearTaskProgress(todoId);
      (window as any).dmPomodoro.stop();
    }, TODO_ID);
  });

  test('reducing pomodoroCount below completed sessions clamps sessionCount', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmPomodoro && !!(window as any).dmSync);

    const TODO_ID = 'edit-pomo-test-2';

    await page.evaluate(async (todoId) => {
      const dmSync = (window as any).dmSync;
      await dmSync.putTodo({
        id: todoId,
        userId: 'test-user',
        title: 'Reduced Pomos Task',
        pomodoroCount: 2,      // reduced from 4
        pomodoroLength: 25,
        breakLength: 5,
        done: false,
        status: 'active',
        bujoType: 'task',
        bujoState: 'open',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // Prior: 3 sessions completed out of 4, then user reduced to 2.
      localStorage.setItem('dm-pomodoro-progress', JSON.stringify({
        [todoId]: {
          sessionsCompleted: 3,
          accWorkSeconds: 4500,
          totalSessions: 4,
          workSeconds: 1500,
          breakSeconds: 300,
          remainingSeconds: 1500,
          savedAt: Date.now(),
        },
      }));
    }, TODO_ID);

    await page.evaluate((todoId) => {
      (window as any).dmPomodoro.start(todoId, 'Reduced Pomos Task');
    }, TODO_ID);

    await page.waitForFunction(() => {
      const dmP = (window as any).dmPomodoro;
      return dmP.getSessionInfo().total === 2 && dmP.isTimerRunning();
    });

    const info = await page.evaluate(() => (window as any).dmPomodoro.getSessionInfo());
    expect(info.total).toBe(2);
    // 3 prior done > new total 2 → clamp to total so sessionCount never exceeds it.
    expect(info.current).toBe(2);

    await page.evaluate(async (todoId) => {
      await (window as any).dmSync.deleteTodo(todoId);
      (window as any).dmPomodoro.clearTaskProgress(todoId);
      (window as any).dmPomodoro.stop();
    }, TODO_ID);
  });
});
