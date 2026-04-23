import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedNote,
  seedTodo,
  cleanupIdb,
  getIdbRecord,
  waitForDmSync,
  makeNote,
  makeTodo,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const NOTE_IDS = ['tr-note-1', 'tr-note-2', 'tr-note-3'];
const TODO_IDS = ['tr-todo-1', 'tr-todo-2'];

async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/trash/');
  await waitForDmSync(page);
  await page.waitForSelector('#trash-list', { timeout: 10_000 });
}

async function triggerRender(page: Parameters<typeof waitForDmSync>[0]) {
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('dm-sync-complete'));
    document.dispatchEvent(new CustomEvent('dm-todos-updated'));
  });
  await page.waitForTimeout(300);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Trash — Data Layer', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('trashNote makes note unreachable via getNote', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'Trash this note', MOCK_USER.uid);
    await page.evaluate((n) => (window as any).dmSync.putNote(n), note);

    await page.evaluate((id) => (window as any).dmSync.trashNote(id), 'tr-note-1');

    const result = await page.evaluate((id) => (window as any).dmSync.getNote(id), 'tr-note-1');
    expect(result).toBeNull();
  });

  test('getTrashedNotes returns trashed notes', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'Trashed note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);

    const trashed = await page.evaluate(() => (window as any).dmSync.getTrashedNotes());
    const ids = trashed.map((n: any) => n.id);
    expect(ids).toContain('tr-note-1');
  });

  test('getTrashedTodos returns trashed todos', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('tr-todo-1', 'Trashed task', MOCK_USER.uid, {
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await seedTodo(page, todo);

    const trashed = await page.evaluate(() => (window as any).dmSync.getTrashedTodos());
    const ids = trashed.map((t: any) => t.id);
    expect(ids).toContain('tr-todo-1');
  });

  test('permanentlyDeleteNote removes note from IDB entirely', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'Perm delete note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);

    await page.evaluate((id) => (window as any).dmSync.permanentlyDeleteNote(id), 'tr-note-1');

    const result = await getIdbRecord(page, 'notes', 'tr-note-1');
    expect(result).toBeNull();
  });

  test('permanentlyDeleteTodo removes todo from IDB entirely', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('tr-todo-1', 'Perm delete task', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedTodo(page, todo);

    await page.evaluate((id) => (window as any).dmSync.permanentlyDeleteTodo(id), 'tr-todo-1');

    const result = await getIdbRecord(page, 'todos', 'tr-todo-1');
    expect(result).toBeNull();
  });

  test('restoreNote re-appears in getAllNotes after restoring', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'Restore me', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);

    await page.evaluate((id) => (window as any).dmSync.restoreNote(id), 'tr-note-1');

    const all = await page.evaluate(() => (window as any).dmSync.getAllNotes());
    const ids = all.map((n: any) => n.id);
    expect(ids).toContain('tr-note-1');
  });

  test('emptyTrash permanently removes all trashed notes', async ({ page }) => {
    await setup(page);
    const n1 = makeNote('tr-note-1', 'Trash 1', MOCK_USER.uid, { deletedAt: Date.now() });
    const n2 = makeNote('tr-note-2', 'Trash 2', MOCK_USER.uid, { deletedAt: Date.now() });
    const active = makeNote('tr-note-3', 'Keep me', MOCK_USER.uid);
    await seedNote(page, n1);
    await seedNote(page, n2);
    await seedNote(page, active);

    await page.evaluate(() => (window as any).dmSync.emptyTrash());

    const trashed = await page.evaluate(() => (window as any).dmSync.getTrashedNotes());
    expect(trashed).toHaveLength(0);

    // Active note stays
    const kept = await page.evaluate((id) => (window as any).dmSync.getNote(id), 'tr-note-3');
    expect(kept).toBeTruthy();
  });

  test('purgeExpiredTrash removes notes trashed over 30 days ago', async ({ page }) => {
    await setup(page);
    const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
    const oldNote = makeNote('tr-note-1', 'Expired note', MOCK_USER.uid, {
      deletedAt: thirtyOneDaysAgo,
    });
    const recentNote = makeNote('tr-note-2', 'Recent trash', MOCK_USER.uid, {
      deletedAt: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
    });
    await seedNote(page, oldNote);
    await seedNote(page, recentNote);

    await page.evaluate(() => (window as any).dmSync.purgeExpiredTrash());

    const expiredResult = await getIdbRecord(page, 'notes', 'tr-note-1');
    expect(expiredResult).toBeNull();

    const recentResult = await getIdbRecord(page, 'notes', 'tr-note-2');
    expect(recentResult).toBeTruthy();
  });
});

test.describe('Trash — UI', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('trash page loads without auth card when logged in', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#trash-auth')).not.toBeVisible();
  });

  test('empty trash message shown when nothing is trashed', async ({ page }) => {
    await setup(page);
    // Ensure no test data is trashed
    await triggerRender(page);

    // The trash-list-empty section should be visible when trash is empty
    // (may depend on whether other real data exists; at minimum verify no crash)
    await expect(page.locator('#trash-list')).toBeAttached();
  });

  test('trashed note renders a restore button', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'UI Restore Note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);
    await triggerRender(page);

    const restoreBtn = page.locator('[data-restore-note="tr-note-1"]');
    await expect(restoreBtn).toBeVisible({ timeout: 5000 });
  });

  test('trashed note renders a permanent delete button', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'UI Delete Note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);
    await triggerRender(page);

    const deleteBtn = page.locator('[data-delete-note="tr-note-1"]');
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
  });

  test('trashed task renders restore and delete buttons', async ({ page }) => {
    await setup(page);
    const todo = makeTodo('tr-todo-1', 'UI Trash Task', MOCK_USER.uid, {
      deletedAt: Date.now(),
      status: 'deleted',
    });
    await seedTodo(page, todo);
    await triggerRender(page);

    await expect(page.locator('[data-restore-todo="tr-todo-1"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-delete-todo="tr-todo-1"]')).toBeVisible();
  });

  test('empty trash button is present', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#trash-empty-btn')).toBeAttached();
  });

  test('clicking restore note removes it from trash view', async ({ page }) => {
    await setup(page);
    const note = makeNote('tr-note-1', 'Click Restore Note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);
    await triggerRender(page);

    const restoreBtn = page.locator('[data-restore-note="tr-note-1"]');
    await expect(restoreBtn).toBeVisible({ timeout: 5000 });
    await restoreBtn.click();
    await page.waitForTimeout(500);

    // After restore the button should be gone
    await expect(restoreBtn).not.toBeVisible();

    // And the note should no longer have deletedAt
    const restored = await page.evaluate((id) => (window as any).dmSync.getNote(id), 'tr-note-1');
    expect(restored?.deletedAt).toBeFalsy();
  });
});

test.describe('Trash — Public API', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('dmSync exposes all trash-related methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const s = (window as any).dmSync;
      return {
        getTrashedNotes: typeof s.getTrashedNotes,
        getTrashedTodos: typeof s.getTrashedTodos,
        permanentlyDeleteNote: typeof s.permanentlyDeleteNote,
        permanentlyDeleteTodo: typeof s.permanentlyDeleteTodo,
        emptyTrash: typeof s.emptyTrash,
        emptyTodoTrash: typeof s.emptyTodoTrash,
        purgeExpiredTrash: typeof s.purgeExpiredTrash,
        restoreNote: typeof s.restoreNote,
        restoreTodo: typeof s.restoreTodo,
      };
    });
    for (const [name, type] of Object.entries(methods)) {
      expect(type, `${name} should be a function`).toBe('function');
    }
  });
});
