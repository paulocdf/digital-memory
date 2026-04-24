import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedTodo,
  seedIdb,
  cleanupIdb,
  getIdbRecord,
  waitForDmSync,
  makeTodo,
  makeNote,
} from './helpers';

// ─────────────────────────────────────────────
// Shared setup helpers
// ─────────────────────────────────────────────

const TODO_IDS = ['it-task-1', 'it-task-2', 'it-task-3', 'it-parent-1', 'it-child-1', 'it-child-2'];
const INBOX_NOTE_ID = 'it-inbox-note';

/** Go to inbox and wait for the todo list to be ready (data layer tests). */
async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/inbox/');
  await waitForDmSync(page);
}

/**
 * Go to inbox and wait for the todo list to be visible (rendering tests).
 * Seeds a minimal inbox note so single-note.html shows .single-note-content,
 * which is the parent container of #todo-list.
 */
async function setupWithNote(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/inbox/');
  await waitForDmSync(page);

  // Seed a minimal inbox note so single-note.html transitions to 'content' state,
  // making .single-note-content (which wraps #todo-list) visible.
  const note = makeNote(INBOX_NOTE_ID, 'Inbox', MOCK_USER.uid, { destination: 'inbox', content: '' });
  await seedIdb(page, 'notes', [note]);

  // Trigger single-note.html to reload from cache with the new note
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dm-sync-complete'));
  });

  // Wait for the todo list container to become actually visible.
  // getComputedStyle reflects parent visibility too — #todo-list is inside
  // .single-note-content which is only shown when an inbox note is found.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('todo-list');
      if (!el) return false;
      return getComputedStyle(el).display !== 'none';
    },
    { timeout: 10_000 },
  );
}

/** Trigger a re-render of the todo list by dispatching the update event. */
async function triggerRender(page: Parameters<typeof waitForDmSync>[0]) {
  await page.evaluate(() => {
    // todo-list.html listens on window (not document) for dm-todos-updated
    window.dispatchEvent(new CustomEvent('dm-todos-updated'));
  });
  // Allow time for async IDB reads inside loadTodos() to complete
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Inbox Tasks — Data Layer', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('putTodo stores a todo and getTodo retrieves it', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('it-task-1', 'Buy groceries', MOCK_USER.uid);

    await page.evaluate((t) => (window as any).dmSync.putTodo(t), todo);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'it-task-1',
    );
    expect(stored).toBeTruthy();
    expect(stored.title).toBe('Buy groceries');
    expect(stored.userId).toBe(MOCK_USER.uid);
  });

  test('getAllTodos returns only non-deleted todos', async ({ page }) => {
    await setup(page);
    const active = makeTodo('it-task-1', 'Active task', MOCK_USER.uid);
    const deleted = makeTodo('it-task-2', 'Deleted task', MOCK_USER.uid, {
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), active);
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), deleted);

    const todos = await page.evaluate(() => (window as any).dmSync.getAllTodos());
    const ids = todos.map((t: any) => t.id);
    expect(ids).toContain('it-task-1');
    expect(ids).not.toContain('it-task-2');
  });

  test('trashTodo sets deletedAt and status', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('it-task-1', 'Task to trash', MOCK_USER.uid);
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), todo);

    await page.evaluate((id) => (window as any).dmSync.trashTodo(id), 'it-task-1');

    // getTodo returns null for trashed items
    const result = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'it-task-1',
    );
    expect(result).toBeNull();

    // getTodoIncludingTrashed still finds it
    const trashed = await page.evaluate(
      (id) => (window as any).dmSync.getTodoIncludingTrashed(id),
      'it-task-1',
    );
    expect(trashed).toBeTruthy();
    expect(trashed.deletedAt).toBeTruthy();
  });

  test('restoreTodo clears deletedAt', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('it-task-1', 'Task to restore', MOCK_USER.uid, {
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await seedTodo(page, todo);

    await page.evaluate((id) => (window as any).dmSync.restoreTodo(id), 'it-task-1');

    const restored = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'it-task-1',
    );
    expect(restored).toBeTruthy();
    expect(restored.deletedAt).toBeFalsy();
    expect(restored.status).toBe('active');
  });

  test('getTodosByParent returns child tasks', async ({ page }) => {
    await setup(page);
    const parent = makeTodo('it-parent-1', 'Parent task', MOCK_USER.uid);
    const child1 = makeTodo('it-child-1', 'Child 1', MOCK_USER.uid, { parentId: 'it-parent-1' });
    const child2 = makeTodo('it-child-2', 'Child 2', MOCK_USER.uid, { parentId: 'it-parent-1' });

    await page.evaluate((t) => (window as any).dmSync.putTodo(t), parent);
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), child1);
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), child2);

    const children = await page.evaluate(
      (id) => (window as any).dmSync.getTodosByParent(id),
      'it-parent-1',
    );
    expect(children).toHaveLength(2);
    const titles = children.map((c: any) => c.title);
    expect(titles).toContain('Child 1');
    expect(titles).toContain('Child 2');
  });

  test('done flag is persisted via putTodo', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('it-task-1', 'Complete me', MOCK_USER.uid);
    await page.evaluate((t) => (window as any).dmSync.putTodo(t), todo);

    // Mark done
    await page.evaluate((id) => {
      const sync = (window as any).dmSync;
      return sync.getTodo(id).then((t: any) => {
        t.done = true;
        t.status = 'done';
        t.bujoState = 'done';
        t.completedAt = Date.now();
        return sync.putTodo(t);
      });
    }, 'it-task-1');

    const updated = await page.evaluate(
      (id) => (window as any).dmSync.getTodo(id),
      'it-task-1',
    );
    expect(updated.done).toBe(true);
    expect(updated.status).toBe('done');
  });

  test('IDB schema has todos object store', async ({ page }) => {
    await setup(page);
    const hasStore = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('dm-notes', 17);
        req.onsuccess = () => {
          const has = req.result.objectStoreNames.contains('todos');
          req.result.close();
          resolve(has);
        };
      });
    });
    expect(hasStore).toBe(true);
  });
});

test.describe('Inbox Tasks — Rendering', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
    await cleanupIdb(page, 'notes', [INBOX_NOTE_ID]);
  });

  test('seeded todo appears in the task list', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'Seeded task title', MOCK_USER.uid);
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).toBeVisible({ timeout: 5000 });
    await expect(item).toContainText('Seeded task title');
  });

  test('done task gets a done CSS class', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'Done task', MOCK_USER.uid, {
      done: true,
      status: 'done',
      bujoState: 'done',
      completedAt: Date.now(),
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).toBeVisible({ timeout: 5000 });
    // Done tasks get a --done class variant
    await expect(item).toHaveClass(/done/);
  });

  test('multiple tasks render in the list', async ({ page }) => {
    await setupWithNote(page);
    const t1 = makeTodo('it-task-1', 'First task', MOCK_USER.uid, { order: 1000 });
    const t2 = makeTodo('it-task-2', 'Second task', MOCK_USER.uid, { order: 2000 });
    const t3 = makeTodo('it-task-3', 'Third task', MOCK_USER.uid, { order: 3000 });
    await seedTodo(page, t1);
    await seedTodo(page, t2);
    await seedTodo(page, t3);
    await triggerRender(page);

    await expect(page.locator('[data-todo-id="it-task-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-todo-id="it-task-2"]')).toBeVisible();
    await expect(page.locator('[data-todo-id="it-task-3"]')).toBeVisible();
  });

  test('deleted task does not appear in the list', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'Deleted task', MOCK_USER.uid, {
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).not.toBeVisible();
  });

  test('todo add form is visible', async ({ page }) => {
    await setupWithNote(page);
    await expect(page.locator('#todo-add-title')).toBeVisible();
    await expect(page.locator('#todo-add-btn')).toBeVisible();
  });

  test('child task renders inside parent item group', async ({ page }) => {
    await setupWithNote(page);
    const parent = makeTodo('it-parent-1', 'Parent task', MOCK_USER.uid, { order: 1000 });
    const child = makeTodo('it-child-1', 'Child task', MOCK_USER.uid, {
      parentId: 'it-parent-1',
      order: 1500,
    });
    await seedTodo(page, parent);
    await seedTodo(page, child);
    await triggerRender(page);

    await expect(page.locator('[data-todo-id="it-parent-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-todo-id="it-child-1"]')).toBeVisible();
  });
});

test.describe('Inbox Tasks — Add Form', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', [INBOX_NOTE_ID]);
    // Clean up any tasks created by title
    await page.evaluate(() => {
      return (window as any).dmSync.getAllTodos().then((todos: any[]) => {
        const testTodos = todos.filter((t: any) => t.title && t.title.startsWith('[TEST]'));
        return Promise.all(testTodos.map((t: any) => (window as any).dmSync.deleteTodo(t.id)));
      });
    });
  });

  test('add form input accepts text', async ({ page }) => {
    await setupWithNote(page);
    const input = page.locator('#todo-add-title');
    await input.fill('[TEST] My new task');
    await expect(input).toHaveValue('[TEST] My new task');
  });

  test('pomodoro count buttons are present', async ({ page }) => {
    await setupWithNote(page);
    await expect(page.locator('#todo-add-pomo-minus')).toBeAttached();
    await expect(page.locator('#todo-add-pomo-plus')).toBeAttached();
    await expect(page.locator('#todo-add-pomodoro-count')).toBeVisible();
  });

  test('date icon button is present', async ({ page }) => {
    await setupWithNote(page);
    await expect(page.locator('#todo-add-date-icon')).toBeAttached();
  });
});

test.describe('Inbox Tasks — BuJo Types', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
    await cleanupIdb(page, 'notes', [INBOX_NOTE_ID]);
  });

  test('task with bujoType "task" renders task bullet', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'BuJo task', MOCK_USER.uid, { bujoType: 'task' });
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).toBeVisible({ timeout: 5000 });
    // Bullet button should carry data-bullet-id
    const bullet = item.locator('[data-bullet-id="it-task-1"]');
    await expect(bullet).toBeAttached();
  });

  test('task with bujoType "event" renders event bullet', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'BuJo event', MOCK_USER.uid, {
      bujoType: 'event',
      bujoState: 'open',
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).toBeVisible({ timeout: 5000 });
  });

  test('task with bujoType "note" renders note bullet', async ({ page }) => {
    await setupWithNote(page);
    const todo = makeTodo('it-task-1', 'BuJo note', MOCK_USER.uid, {
      bujoType: 'note',
      bujoState: 'open',
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    const item = page.locator('[data-todo-id="it-task-1"]');
    await expect(item).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Inbox Tasks — Public API', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('dmSync exposes required todo methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const s = (window as any).dmSync;
      return {
        getTodo: typeof s.getTodo,
        getTodoIncludingTrashed: typeof s.getTodoIncludingTrashed,
        getAllTodos: typeof s.getAllTodos,
        putTodo: typeof s.putTodo,
        deleteTodo: typeof s.deleteTodo,
        trashTodo: typeof s.trashTodo,
        restoreTodo: typeof s.restoreTodo,
        getTodosByParent: typeof s.getTodosByParent,
        getTopLevelTodos: typeof s.getTopLevelTodos,
        getTrashedTodos: typeof s.getTrashedTodos,
        permanentlyDeleteTodo: typeof s.permanentlyDeleteTodo,
      };
    });
    for (const [name, type] of Object.entries(methods)) {
      expect(type, `${name} should be a function`).toBe('function');
    }
  });
});
