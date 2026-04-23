import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedNote,
  cleanupIdb,
  getIdbRecord,
  waitForDmSync,
  makeNote,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const NOTE_IDS = ['nc-note-1', 'nc-note-2', 'nc-note-3'];

async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/inbox/');
  await waitForDmSync(page);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Notes CRUD — Data Layer', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
  });

  test('putNote stores a note and getNote retrieves it', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Test Note', MOCK_USER.uid, {
      content: 'Hello world',
      tags: ['testing'],
    });
    await page.evaluate((n) => (window as any).dmSync.putNote(n), note);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getNote(id),
      'nc-note-1',
    );
    expect(stored).toBeTruthy();
    expect(stored.title).toBe('Test Note');
    expect(stored.content).toBe('Hello world');
    expect(stored.tags).toEqual(['testing']);
  });

  test('getAllNotes excludes trashed notes', async ({ page }) => {
    await setup(page);
    const active = makeNote('nc-note-1', 'Active note', MOCK_USER.uid);
    const trashed = makeNote('nc-note-2', 'Trashed note', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await page.evaluate((n) => (window as any).dmSync.putNote(n), active);
    await page.evaluate((n) => (window as any).dmSync.putNote(n), trashed);

    const all = await page.evaluate(() => (window as any).dmSync.getAllNotes());
    const ids = all.map((n: any) => n.id);
    expect(ids).toContain('nc-note-1');
    expect(ids).not.toContain('nc-note-2');
  });

  test('trashNote sets deletedAt and getNote returns null', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Note to trash', MOCK_USER.uid);
    await page.evaluate((n) => (window as any).dmSync.putNote(n), note);

    await page.evaluate((id) => (window as any).dmSync.trashNote(id), 'nc-note-1');

    const result = await page.evaluate(
      (id) => (window as any).dmSync.getNote(id),
      'nc-note-1',
    );
    expect(result).toBeNull();

    // getNoteIncludingTrashed still returns it
    const trashed = await page.evaluate(
      (id) => (window as any).dmSync.getNoteIncludingTrashed(id),
      'nc-note-1',
    );
    expect(trashed).toBeTruthy();
    expect(trashed.deletedAt).toBeTruthy();
  });

  test('restoreNote clears deletedAt', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Note to restore', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);

    await page.evaluate((id) => (window as any).dmSync.restoreNote(id), 'nc-note-1');

    const restored = await page.evaluate(
      (id) => (window as any).dmSync.getNote(id),
      'nc-note-1',
    );
    expect(restored).toBeTruthy();
    expect(restored.deletedAt).toBeFalsy();
  });

  test('getTrashedNotes returns only trashed notes', async ({ page }) => {
    await setup(page);
    const active = makeNote('nc-note-1', 'Active', MOCK_USER.uid);
    const trashed = makeNote('nc-note-2', 'Trashed', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, active);
    await seedNote(page, trashed);

    const result = await page.evaluate(() => (window as any).dmSync.getTrashedNotes());
    const ids = result.map((n: any) => n.id);
    expect(ids).toContain('nc-note-2');
    expect(ids).not.toContain('nc-note-1');
  });

  test('permanentlyDeleteNote removes note from IDB', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'To permanently delete', MOCK_USER.uid, {
      deletedAt: Date.now(),
    });
    await seedNote(page, note);

    await page.evaluate(
      (id) => (window as any).dmSync.permanentlyDeleteNote(id),
      'nc-note-1',
    );

    const result = await getIdbRecord(page, 'notes', 'nc-note-1');
    expect(result).toBeNull();
  });

  test('pinned field is persisted correctly', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Pinned note', MOCK_USER.uid, { pinned: true });
    await page.evaluate((n) => (window as any).dmSync.putNote(n), note);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getNote(id),
      'nc-note-1',
    );
    expect(stored.pinned).toBe(true);
  });

  test('tags array is persisted correctly', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Tagged note', MOCK_USER.uid, {
      tags: ['javascript', 'testing', 'playwright'],
    });
    await page.evaluate((n) => (window as any).dmSync.putNote(n), note);

    const stored = await page.evaluate(
      (id) => (window as any).dmSync.getNote(id),
      'nc-note-1',
    );
    expect(stored.tags).toEqual(['javascript', 'testing', 'playwright']);
  });

  test('IDB notes object store exists', async ({ page }) => {
    await setup(page);
    const hasStore = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('dm-notes', 16);
        req.onsuccess = () => {
          const has = req.result.objectStoreNames.contains('notes');
          req.result.close();
          resolve(has);
        };
      });
    });
    expect(hasStore).toBe(true);
  });
});

test.describe('Notes CRUD — Edit Modal UI', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
    await page.evaluate(() => {
      if ((window as any).dmEditModal) (window as any).dmEditModal.close();
    }).catch(() => {});
  });

  test('edit modal opens with note title populated', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Modal Note Title', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmEditModal.open(n), note);

    const modal = page.locator('#note-edit-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#note-edit-title')).toHaveValue('Modal Note Title');
  });

  test('edit modal opens with note content populated', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Content Note', MOCK_USER.uid, {
      content: 'This is the note body text',
    });
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmEditModal.open(n), note);

    await expect(page.locator('#note-edit-content')).toHaveValue('This is the note body text');
  });

  test('edit modal has save button', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Save Button Note', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmEditModal.open(n), note);

    await expect(page.locator('#note-edit-save')).toBeVisible();
  });

  test('dmEditModal.close() hides the modal', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Close Test Note', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmEditModal.open(n), note);
    await expect(page.locator('#note-edit-modal')).toBeVisible({ timeout: 5000 });

    await page.evaluate(() => (window as any).dmEditModal.close());
    await expect(page.locator('#note-edit-modal')).not.toBeVisible();
  });

  test('edit modal shows sharing section for note owner', async ({ page }) => {
    await setup(page);
    const note = makeNote('nc-note-1', 'Share Section Note', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmEditModal.open(n), note);

    await expect(page.locator('#note-edit-sharing-section')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Notes CRUD — Public API', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('dmSync exposes all required note methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const s = (window as any).dmSync;
      return {
        getNote: typeof s.getNote,
        getNoteIncludingTrashed: typeof s.getNoteIncludingTrashed,
        getAllNotes: typeof s.getAllNotes,
        putNote: typeof s.putNote,
        deleteNote: typeof s.deleteNote,
        trashNote: typeof s.trashNote,
        restoreNote: typeof s.restoreNote,
        getTrashedNotes: typeof s.getTrashedNotes,
        permanentlyDeleteNote: typeof s.permanentlyDeleteNote,
        emptyTrash: typeof s.emptyTrash,
        purgeExpiredTrash: typeof s.purgeExpiredTrash,
      };
    });
    for (const [name, type] of Object.entries(methods)) {
      expect(type, `${name} should be a function`).toBe('function');
    }
  });

  test('dmEditModal exposes open and close', async ({ page }) => {
    const api = await page.evaluate(() => {
      const m = (window as any).dmEditModal;
      return { open: typeof m?.open, close: typeof m?.close };
    });
    expect(api.open).toBe('function');
    expect(api.close).toBe('function');
  });
});
