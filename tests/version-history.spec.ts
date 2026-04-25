import { test, expect } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedNote,
  seedIdb,
  cleanupIdb,
  getIdbRecord,
  getAllIdbRecords,
  waitForDmSync,
  makeNote,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const NOTE_IDS = ['vh-note-1', 'vh-note-2'];
const VERSION_IDS = ['vh-ver-1', 'vh-ver-2', 'vh-ver-3'];

function makeVersion(id: string, noteId: string, opts: Record<string, any> = {}) {
  return {
    id,
    noteId,
    userId: MOCK_USER.uid,
    title: opts.title ?? 'Note Title',
    content: opts.content ?? 'Version content',
    tags: opts.tags ?? [],
    createdAt: opts.createdAt ?? Date.now(),
    ...opts,
  };
}

async function setup(page: Parameters<typeof waitForDmSync>[0]) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/inbox/');
  await waitForDmSync(page);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Version History — Data Layer', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
    await cleanupIdb(page, 'noteVersions', VERSION_IDS);
  });

  test('noteVersions object store exists in IDB', async ({ page }) => {
    await setup(page);
    const hasStore = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('dm-notes', 18);
        req.onsuccess = () => {
          const has = req.result.objectStoreNames.contains('noteVersions');
          req.result.close();
          resolve(has);
        };
      });
    });
    expect(hasStore).toBe(true);
  });

  test('getVersionsForNote returns empty array when no versions exist', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'No versions note', MOCK_USER.uid);
    await seedNote(page, note);

    const versions = await page.evaluate(
      (id) => (window as any).dmSync.getVersionsForNote(id),
      'vh-note-1',
    );
    expect(Array.isArray(versions)).toBe(true);
    expect(versions).toHaveLength(0);
  });

  test('seeded version is returned by getVersionsForNote', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Versioned note', MOCK_USER.uid);
    await seedNote(page, note);

    const version = makeVersion('vh-ver-1', 'vh-note-1', {
      title: 'Old title',
      content: 'Old content',
      createdAt: Date.now() - 10000,
    });
    await seedIdb(page, 'noteVersions', [version]);

    const versions = await page.evaluate(
      (id) => (window as any).dmSync.getVersionsForNote(id),
      'vh-note-1',
    );
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe('vh-ver-1');
    expect(versions[0].title).toBe('Old title');
  });

  test('multiple versions are returned sorted newest-first', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Multi-version note', MOCK_USER.uid);
    await seedNote(page, note);

    const now = Date.now();
    const v1 = makeVersion('vh-ver-1', 'vh-note-1', { createdAt: now - 20000, content: 'V1' });
    const v2 = makeVersion('vh-ver-2', 'vh-note-1', { createdAt: now - 10000, content: 'V2' });
    const v3 = makeVersion('vh-ver-3', 'vh-note-1', { createdAt: now - 5000, content: 'V3' });
    await seedIdb(page, 'noteVersions', [v1, v2, v3]);

    const versions = await page.evaluate(
      (id) => (window as any).dmSync.getVersionsForNote(id),
      'vh-note-1',
    );
    expect(versions).toHaveLength(3);
    // Should be sorted newest-first
    expect(versions[0].createdAt).toBeGreaterThanOrEqual(versions[1].createdAt);
    expect(versions[1].createdAt).toBeGreaterThanOrEqual(versions[2].createdAt);
  });

  test('version is properly written and read from IDB', async ({ page }) => {
    await setup(page);
    const version = makeVersion('vh-ver-1', 'vh-note-1', {
      title: 'Stored version title',
      content: 'Stored version content',
    });
    await seedIdb(page, 'noteVersions', [version]);

    const stored = await getIdbRecord(page, 'noteVersions', 'vh-ver-1');
    expect(stored).toBeTruthy();
    expect(stored.noteId).toBe('vh-note-1');
    expect(stored.title).toBe('Stored version title');
    expect(stored.content).toBe('Stored version content');
  });
});

test.describe('Version History — Modal UI', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
    await cleanupIdb(page, 'noteVersions', VERSION_IDS);
    await page.evaluate(() => {
      if ((window as any).dmVersionHistory) (window as any).dmVersionHistory.close();
    }).catch(() => {});
  });

  test('version history modal opens for a note', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Version Modal Note', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);

    const modal = page.locator('#vh-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('modal displays the note title in header', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Title In Header', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);

    await expect(page.locator('#vh-note-title')).toContainText('Title In Header', { timeout: 5000 });
  });

  test('modal shows empty state when note has no versions', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'No Versions Yet', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);

    await page.waitForTimeout(500);
    await expect(page.locator('#vh-empty')).toBeVisible({ timeout: 5000 });
  });

  test('modal close button hides the modal', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Close Modal Note', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);
    await expect(page.locator('#vh-modal')).toBeVisible({ timeout: 5000 });

    await page.locator('#vh-close').click();
    await expect(page.locator('#vh-modal')).not.toBeVisible();
  });

  test('dmVersionHistory.close() hides the modal', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Close Via API', MOCK_USER.uid);
    await seedNote(page, note);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);
    await expect(page.locator('#vh-modal')).toBeVisible({ timeout: 5000 });

    await page.evaluate(() => (window as any).dmVersionHistory.close());
    await expect(page.locator('#vh-modal')).not.toBeVisible();
  });

  test('versions appear in the sidebar list', async ({ page }) => {
    await setup(page);
    const note = makeNote('vh-note-1', 'Multi Version Modal', MOCK_USER.uid);
    await seedNote(page, note);

    const now = Date.now();
    const v1 = makeVersion('vh-ver-1', 'vh-note-1', { createdAt: now - 20000 });
    const v2 = makeVersion('vh-ver-2', 'vh-note-1', { createdAt: now - 10000 });
    await seedIdb(page, 'noteVersions', [v1, v2]);

    await page.evaluate((n) => (window as any).dmVersionHistory.open(n), note);
    await page.waitForTimeout(500);

    const list = page.locator('#vh-list');
    await expect(list).toBeVisible({ timeout: 5000 });
    const items = list.locator('li');
    await expect(items).toHaveCount(2);
  });
});

test.describe('Version History — Public API', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('dmVersionHistory exposes open and close', async ({ page }) => {
    const api = await page.evaluate(() => {
      const vh = (window as any).dmVersionHistory;
      return { open: typeof vh?.open, close: typeof vh?.close };
    });
    expect(api.open).toBe('function');
    expect(api.close).toBe('function');
  });

  test('dmSync exposes getVersionsForNote and saveNoteVersion', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const s = (window as any).dmSync;
      return {
        getVersionsForNote: typeof s.getVersionsForNote,
        saveNoteVersion: typeof s.saveNoteVersion,
      };
    });
    expect(methods.getVersionsForNote).toBe('function');
    expect(methods.saveNoteVersion).toBe('function');
  });
});
