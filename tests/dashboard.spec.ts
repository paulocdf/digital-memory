import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedTodo,
  cleanupIdb,
  waitForDmSync,
  makeTodo,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const TODO_IDS = [
  'db-task-1', 'db-task-2', 'db-task-3',
  'db-task-4', 'db-task-5',
];

async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/dashboard/');
  await waitForDmSync(page);
  // Wait for dashboard to leave initial hidden state (any visible state: auth, loading, empty, or content)
  await page.waitForFunction(
    () => {
      const ids = ['dashboard-auth', 'dashboard-content', 'dashboard-loading', 'dashboard-empty'];
      return ids.some(id => {
        const el = document.getElementById(id);
        return el && getComputedStyle(el).display !== 'none';
      });
    },
    { timeout: 10_000 },
  );
}

/** Seed some completed todos (required for dashboard to show content). */
async function seedCompletedTodos(page: Parameters<typeof waitForDmSync>[0]) {
  const now = Date.now();
  const yesterday = now - 86400000;

  await seedTodo(page, makeTodo('db-task-1', 'Completed task 1', MOCK_USER.uid, {
    done: true,
    status: 'done',
    bujoState: 'done',
    estimatedMin: 30,
    actualMin: 25,
    category: 'Work',
    completedAt: yesterday,
    scheduledDate: new Date(yesterday).toISOString().split('T')[0],
  }));
  await seedTodo(page, makeTodo('db-task-2', 'Completed task 2', MOCK_USER.uid, {
    done: true,
    status: 'done',
    bujoState: 'done',
    estimatedMin: 60,
    actualMin: 70,
    category: 'Personal',
    completedAt: yesterday,
    scheduledDate: new Date(yesterday).toISOString().split('T')[0],
  }));
  await seedTodo(page, makeTodo('db-task-3', 'Active task', MOCK_USER.uid, {
    done: false,
    status: 'active',
    estimatedMin: 25,
    category: 'Work',
  }));
}

async function triggerRender(page: Parameters<typeof waitForDmSync>[0]) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dm-todos-updated'));
    window.dispatchEvent(new CustomEvent('dm-sync-complete'));
  });
  await page.waitForTimeout(400);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Dashboard — Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('dashboard page loads without showing auth card when logged in', async ({ page }) => {
    await expect(page.locator('#dashboard-auth')).not.toBeVisible();
  });

  test('dashboard content container is present in DOM', async ({ page }) => {
    await expect(page.locator('#dashboard-content')).toBeAttached();
  });

  test('dashboard summary section is present', async ({ page }) => {
    await expect(page.locator('#dashboard-summary')).toBeAttached();
  });

  test('dashboard activity section is present', async ({ page }) => {
    await expect(page.locator('#dashboard-activity')).toBeAttached();
  });

  test('dashboard categories section is present', async ({ page }) => {
    await expect(page.locator('#dashboard-categories')).toBeAttached();
  });
});

test.describe('Dashboard — Content Rendering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('summary section renders stat cards when completed todos exist', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);
    await triggerRender(page);

    // Dashboard should transition out of loading/empty when completed todos exist
    await expect(page.locator('#dashboard-content')).toBeVisible({ timeout: 8000 });
    const summary = page.locator('#dashboard-summary');
    await expect(summary).not.toBeEmpty();
  });

  test('stat cards display labels', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);
    await triggerRender(page);

    await expect(page.locator('#dashboard-content')).toBeVisible({ timeout: 8000 });

    // Check for stat labels that should always appear
    const summary = page.locator('#dashboard-summary');
    await expect(summary).toContainText('Tasks Done');
    await expect(summary).toContainText('Time Tracked');
  });

  test('activity section renders after todos are loaded', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);
    await triggerRender(page);

    await expect(page.locator('#dashboard-content')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#dashboard-activity')).not.toBeEmpty();
  });

  test('shows empty/loading state when no completed todos exist', async ({ page }) => {
    await setup(page);
    // Seed only active (not done) todos
    await seedTodo(page, makeTodo('db-task-4', 'Not done', MOCK_USER.uid, { done: false }));
    await triggerRender(page);

    // With no done todos, dashboard shows empty state (not content)
    await page.waitForTimeout(1000);
    await expect(page.locator('#dashboard-content')).not.toBeVisible();
  });
});

test.describe('Dashboard — Data Aggregation', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('getAllTodos returns all test todos including done ones', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);

    const todos = await page.evaluate(() => (window as any).dmSync.getAllTodos());
    const ids = todos.map((t: any) => t.id);
    expect(ids).toContain('db-task-1');
    expect(ids).toContain('db-task-2');
    expect(ids).toContain('db-task-3');
  });

  test('done todos have status "done" in IDB', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);

    const todos = await page.evaluate(() => (window as any).dmSync.getAllTodos());
    const done = todos.filter((t: any) => t.done);
    expect(done.length).toBeGreaterThanOrEqual(2);
    done.forEach((t: any) => {
      expect(t.status).toBe('done');
    });
  });

  test('categories are persisted on todos', async ({ page }) => {
    await setup(page);
    await seedCompletedTodos(page);

    const todos = await page.evaluate(() => (window as any).dmSync.getAllTodos());
    const workTodos = todos.filter((t: any) => t.category === 'Work');
    expect(workTodos.length).toBeGreaterThanOrEqual(1);
  });
});
