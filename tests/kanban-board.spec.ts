import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedTodo,
  cleanupIdb,
  getIdbRecord,
  waitForDmSync,
  makeTodo,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const TODO_IDS = ['kb-task-1', 'kb-task-2', 'kb-task-3', 'kb-task-4'];

async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/board/');
  await waitForDmSync(page);
  // Wait for the board columns to render
  await page.waitForSelector('[data-kanban-status]', { timeout: 10_000 });
}

async function triggerRender(page: Parameters<typeof waitForDmSync>[0]) {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('dm-todos-updated'));
  });
  await page.waitForTimeout(300);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Kanban Board — Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('renders three columns: todo, in_progress, done', async ({ page }) => {
    await expect(page.locator('[data-kanban-status="todo"]')).toBeAttached();
    await expect(page.locator('[data-kanban-status="in_progress"]')).toBeAttached();
    await expect(page.locator('[data-kanban-status="done"]')).toBeAttached();
  });

  test('each column has a header and a count badge', async ({ page }) => {
    await expect(page.locator('[data-col-count="todo"]')).toBeAttached();
    await expect(page.locator('[data-col-count="in_progress"]')).toBeAttached();
    await expect(page.locator('[data-col-count="done"]')).toBeAttached();
  });

  test('board loads without showing the auth card when logged in', async ({ page }) => {
    await expect(page.locator('.kanban-auth')).not.toBeVisible();
  });
});

test.describe('Kanban Board — Card Rendering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('task with kanbanStatus "todo" appears in the To Do column', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'Kanban todo task', MOCK_USER.uid, {
      kanbanStatus: 'todo',
      kanbanOrder: 1000,
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const todoColItems = page.locator('[data-col-items="todo"]');
    await expect(todoColItems.locator('[data-todo-id="kb-task-1"]')).toBeVisible({ timeout: 5000 });
  });

  test('task with kanbanStatus "in_progress" appears in In Progress column', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'In progress task', MOCK_USER.uid, {
      kanbanStatus: 'in_progress',
      kanbanOrder: 1000,
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const inProgressItems = page.locator('[data-col-items="in_progress"]');
    await expect(inProgressItems.locator('[data-todo-id="kb-task-1"]')).toBeVisible({ timeout: 5000 });
  });

  test('task with kanbanStatus "done" appears in Done column', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'Done kanban task', MOCK_USER.uid, {
      kanbanStatus: 'done',
      kanbanOrder: 1000,
      done: true,
      status: 'done',
      completedAt: Date.now(),
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const doneItems = page.locator('[data-col-items="done"]');
    await expect(doneItems.locator('[data-todo-id="kb-task-1"]')).toBeVisible({ timeout: 5000 });
  });

  test('tasks appear in their respective columns when multiple exist', async ({ page }) => {
    await setup(page);
    await seedTodo(page, makeTodo('kb-task-1', 'Todo card', MOCK_USER.uid, { kanbanStatus: 'todo', kanbanOrder: 1000 }));
    await seedTodo(page, makeTodo('kb-task-2', 'In progress card', MOCK_USER.uid, { kanbanStatus: 'in_progress', kanbanOrder: 1000 }));
    await seedTodo(page, makeTodo('kb-task-3', 'Done card', MOCK_USER.uid, { kanbanStatus: 'done', kanbanOrder: 1000, done: true, status: 'done', completedAt: Date.now() }));
    await triggerRender(page);

    await expect(page.locator('[data-col-items="todo"] [data-todo-id="kb-task-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-col-items="in_progress"] [data-todo-id="kb-task-2"]')).toBeVisible();
    await expect(page.locator('[data-col-items="done"] [data-todo-id="kb-task-3"]')).toBeVisible();
  });

  test('card title text is displayed', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'My Kanban Title', MOCK_USER.uid, {
      kanbanStatus: 'todo',
      kanbanOrder: 1000,
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const card = page.locator('[data-todo-id="kb-task-1"]');
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.kanban-card-title')).toContainText('My Kanban Title');
  });

  test('deleted task does not appear on the board', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'Deleted card', MOCK_USER.uid, {
      kanbanStatus: 'todo',
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    await expect(page.locator('[data-todo-id="kb-task-1"]')).not.toBeVisible();
  });

  test('column count updates when tasks are present', async ({ page }) => {
    await setup(page);
    await seedTodo(page, makeTodo('kb-task-1', 'Count task 1', MOCK_USER.uid, { kanbanStatus: 'todo', kanbanOrder: 1000 }));
    await seedTodo(page, makeTodo('kb-task-2', 'Count task 2', MOCK_USER.uid, { kanbanStatus: 'todo', kanbanOrder: 2000 }));
    await triggerRender(page);

    const countBadge = page.locator('[data-col-count="todo"]');
    const countText = await countBadge.textContent();
    expect(parseInt(countText || '0')).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Kanban Board — IDB Sync', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('kanbanStatus field is persisted in IDB', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'Persist kanban status', MOCK_USER.uid, {
      kanbanStatus: 'in_progress',
    });
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), todo);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'kb-task-1',
    );
    expect(stored.kanbanStatus).toBe('in_progress');
  });

  test('kanbanOrder field is persisted in IDB', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('kb-task-1', 'Persist kanban order', MOCK_USER.uid, {
      kanbanStatus: 'todo',
      kanbanOrder: 42.5,
    });
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), todo);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'kb-task-1',
    );
    expect(stored.kanbanOrder).toBe(42.5);
  });
});
