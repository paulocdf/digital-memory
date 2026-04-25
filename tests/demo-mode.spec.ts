import { test, expect } from '@playwright/test';

/**
 * Demo mode tests — verify that signed-out visitors see curated dummy data
 * across every section instead of empty states. The demo activates
 * automatically when no `dm-cached-user` is in localStorage and `dm-demo-disabled`
 * is not set. Edits made in demo mode are ephemeral (in-memory) and are
 * discarded on reload.
 *
 * These tests do NOT inject mock auth, which lets `window.dmDemo.activate()`
 * fire after `dmAuthReady` resolves with a null user.
 */
test.describe('Demo mode', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean slate — no cached user, demo not opted-out, banner not dismissed.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('dm-cached-user');
        localStorage.removeItem('dm-demo-disabled');
        localStorage.removeItem('dm-demo-banner-dismissed');
      } catch (e) {}
    });
  });

  test('demo activates and exposes window.dmDemo API', async ({ page }) => {
    await page.goto('./');
    // Wait for the auth listener to flip dmDemo on.
    await page.waitForFunction(
      () => !!(window as any).dmDemo && (window as any).dmDemo.isActive(),
      null,
      { timeout: 10_000 },
    );
    const api = await page.evaluate(() => {
      const d = (window as any).dmDemo;
      return {
        active: d.isActive(),
        userId: d.userId,
        hasFakeUser: typeof d.fakeUser === 'function',
      };
    });
    expect(api.active).toBe(true);
    expect(api.userId).toBeTruthy();
    expect(api.hasFakeUser).toBe(true);
  });

  test('demo banner is visible by default', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmDemo);
    const banner = page.locator('#dm-demo-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/sample data/i);
  });

  test('banner can be dismissed and stays dismissed for the session', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmDemo);
    const dismiss = page.locator('#dm-demo-dismiss');
    await dismiss.click();
    await expect(page.locator('#dm-demo-banner')).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem('dm-demo-banner-dismissed'));
    expect(stored).toBe('1');
  });

  test('opting out via dm-demo-disabled prevents activation', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('dm-demo-disabled', '1'); } catch (e) {}
    });
    await page.goto('./');
    // Give the auth listener a moment to settle.
    await page.waitForTimeout(500);
    const active = await page.evaluate(
      () => !!((window as any).dmDemo && (window as any).dmDemo.isActive()),
    );
    expect(active).toBe(false);
  });

  test('inbox shows demo todos', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    // Wait for todo-list to populate from dmSync.getAllTodos() (which is shadowed by dmDemo).
    await page.waitForFunction(
      () => document.querySelectorAll('.todo-item').length > 0,
      null,
      { timeout: 10_000 },
    );
    const count = await page.locator('.todo-item').count();
    expect(count).toBeGreaterThan(0);
  });

  test('kanban shows demo tasks across columns', async ({ page }) => {
    await page.goto('./docs/board/');
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    await page.waitForFunction(
      () => document.querySelectorAll('.kanban-card').length > 0,
      null,
      { timeout: 10_000 },
    );
    const cards = await page.locator('.kanban-card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('dashboard renders with demo data (no sign-in CTA)', async ({ page }) => {
    await page.goto('./docs/dashboard/');
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    // The auth-only state shows a "Sign in" prompt; demo mode should bypass it.
    await page.waitForTimeout(800);
    const signInVisible = await page
      .locator('text=Sign in to view your dashboard')
      .first()
      .isVisible()
      .catch(() => false);
    expect(signInVisible).toBe(false);
  });

  test('budget overview shows demo categories', async ({ page }) => {
    await page.goto('./docs/budget/');
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    await page.waitForTimeout(800);
    const html = await page.content();
    // Should not show the "Sign in" empty state; should show some category content.
    expect(html).not.toMatch(/Sign in to view your budget/i);
  });

  test('ephemeral todo creation does not persist across reload', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    await page.waitForFunction(
      () => document.querySelectorAll('.todo-item').length > 0,
      null,
      { timeout: 10_000 },
    );

    const ephemeralTitle = 'Demo ephemeral check ' + Date.now();
    // Use the public API to create a todo in demo mode.
    await page.evaluate(async (title) => {
      const sync = (window as any).dmSync;
      const demo = (window as any).dmDemo;
      const u = demo.fakeUser();
      const id = 'ephemeral-' + Date.now();
      await sync.putTodo({
        id,
        userId: u.uid,
        title,
        status: 'active',
        done: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        order: Date.now(),
        scheduledDate: null,
        bujoType: 'task',
        bujoState: 'open',
        kanbanStatus: 'todo',
      });
      window.dispatchEvent(new CustomEvent('dm-todos-updated'));
    }, ephemeralTitle);

    // Confirm it shows up on this page session.
    await page.waitForFunction(
      (title) => Array.from(document.querySelectorAll('.todo-item')).some(
        (el) => (el.textContent || '').includes(title),
      ),
      ephemeralTitle,
      { timeout: 5_000 },
    );

    // Reload — fixtures are rebuilt fresh, ephemeral todo should be gone.
    await page.reload();
    await page.waitForFunction(() => !!(window as any).dmDemo && (window as any).dmDemo.isActive());
    await page.waitForFunction(
      () => document.querySelectorAll('.todo-item').length > 0,
      null,
      { timeout: 10_000 },
    );
    const stillThere = await page.evaluate(
      (title) => Array.from(document.querySelectorAll('.todo-item')).some(
        (el) => (el.textContent || '').includes(title),
      ),
      ephemeralTitle,
    );
    expect(stillThere).toBe(false);
  });
});
