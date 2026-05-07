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
// Inline note editor (window.dmInlineEditor)
//
// The Edit button in the note viewer opens an inline textarea editor in
// place of the rendered note body. The full edit modal (dmEditModal) is
// reachable from the inline editor's "Open in full editor" button.
// ─────────────────────────────────────────────

const NOTE_IDS = ['ie-note-1', 'ie-note-2'];

const VIEW_PATH_FOR = (id: string) => `./docs/view/?id=${encodeURIComponent(id)}`;

async function setupViewer(page: Parameters<typeof waitForDmSync>[0], noteId: string) {
  await injectMockAuth(page, MOCK_USER);
  // Seed BEFORE navigating so the view page can read on first paint.
  await page.goto('./docs/inbox/');
  await waitForDmSync(page);
  await seedNote(
    page,
    makeNote(noteId, 'Inline Editor Test', MOCK_USER.uid, {
      content: 'Initial content line.\n\nSecond paragraph.',
      tags: ['inline'],
    }),
  );
  await page.goto(VIEW_PATH_FOR(noteId));
  await waitForDmSync(page);
  // The viewer renders asynchronously after wikilink-map resolution. Wait for
  // the body to be populated rather than a race-y timeout.
  await page.locator('#note-viewer-body').waitFor({ state: 'visible' });
  await expect(page.locator('#note-viewer-body')).toContainText('Initial content line.');
}

test.describe('Inline note editor', () => {
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'notes', NOTE_IDS);
  });

  test('exposes window.dmInlineEditor public API', async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const api = await page.evaluate(() => {
      const ie = (window as any).dmInlineEditor;
      if (!ie) return null;
      return {
        hasOpen: typeof ie.open === 'function',
        hasClose: typeof ie.close === 'function',
        hasIsActive: typeof ie.isActive === 'function',
        initiallyInactive: ie.isActive() === false,
      };
    });

    expect(api).toEqual({
      hasOpen: true,
      hasClose: true,
      hasIsActive: true,
      initiallyInactive: true,
    });
  });

  test('clicking Edit replaces the rendered body with the inline editor', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');

    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    await page.locator('#note-viewer-edit').click();

    const editor = page.locator('.dm-inline-editor');
    await expect(editor).toHaveCount(1);
    await expect(editor.locator('textarea.dm-inline-editor-textarea')).toBeVisible();
    // The rendered body element is hidden (display:none) but still in the DOM.
    await expect(page.locator('#note-viewer-body')).toBeHidden();

    // Textarea is pre-populated from note.content.
    const value = await editor.locator('textarea').inputValue();
    expect(value).toContain('Initial content line.');
    expect(value).toContain('Second paragraph.');

    // isActive() reflects state.
    const active = await page.evaluate(() => (window as any).dmInlineEditor.isActive());
    expect(active).toBe(true);
  });

  test('Cmd+Enter saves and closes; IDB reflects the edit', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const textarea = page.locator('.dm-inline-editor textarea');
    await textarea.click();
    await textarea.fill('Edited via inline (Cmd+Enter).');

    // Use Meta on darwin, Control elsewhere — Playwright `Meta+Enter` works
    // on macOS host runners; we run in Linux-based Docker so Control+Enter
    // is the canonical chord (the editor checks both `metaKey` and `ctrlKey`).
    await textarea.press('Control+Enter');

    // Editor collapses, rendered body shows again.
    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    await expect(page.locator('#note-viewer-body')).toBeVisible();
    await expect(page.locator('#note-viewer-body')).toContainText('Edited via inline (Cmd+Enter).');

    // IDB write completes asynchronously after DOM teardown — poll until it
    // lands (typically a few ms; budget ample headroom for slow CI).
    await expect
      .poll(async () => {
        const stored = await getIdbRecord(page, 'notes', 'ie-note-1');
        return (stored as any)?.content;
      }, { timeout: 5000 })
      .toBe('Edited via inline (Cmd+Enter).');
  });

  test('Save button persists changes and closes the editor', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const editor = page.locator('.dm-inline-editor');
    const textarea = editor.locator('textarea');
    await textarea.click();
    await textarea.fill('Saved via Save button.');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    await expect
      .poll(async () => {
        const stored = await getIdbRecord(page, 'notes', 'ie-note-1');
        return (stored as any)?.content;
      }, { timeout: 5000 })
      .toBe('Saved via Save button.');
  });

  test('Cancel discards unsaved (post-debounce) changes', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const editor = page.locator('.dm-inline-editor');
    // Type something but Cancel BEFORE the 2 s autosave debounce fires.
    await editor.locator('textarea').click();
    await editor.locator('textarea').fill('Discarded text.');
    await editor.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    // Give any rogue background write a moment to settle, then assert the
    // original content is still in IDB.
    await page.waitForTimeout(300);
    const stored = await getIdbRecord(page, 'notes', 'ie-note-1');
    expect((stored as any).content).toBe('Initial content line.\n\nSecond paragraph.');
  });

  test('Escape commits and closes', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const textarea = page.locator('.dm-inline-editor textarea');
    await textarea.click();
    await textarea.fill('Saved via Escape.');
    await textarea.press('Escape');

    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    await expect
      .poll(async () => {
        const stored = await getIdbRecord(page, 'notes', 'ie-note-1');
        return (stored as any)?.content;
      }, { timeout: 5000 })
      .toBe('Saved via Escape.');
  });

  test('autosave fires after idle and shows "Saved" status', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const editor = page.locator('.dm-inline-editor');
    await editor.locator('textarea').click();
    await editor.locator('textarea').fill('Autosaved content.');

    // Status indicator transitions: dirty → saving → saved. We assert the
    // terminal "saved" state with a generous timeout (autosave debounce is
    // 2 s + Firestore write).
    const status = editor.locator('.dm-ie-status');
    await expect(status).toHaveAttribute('data-state', 'saved', { timeout: 8000 });

    // IDB updated, editor still open.
    const stored = await getIdbRecord(page, 'notes', 'ie-note-1');
    expect((stored as any).content).toBe('Autosaved content.');
    await expect(page.locator('.dm-inline-editor')).toHaveCount(1);
  });

  test('toolbar Bold button wraps selection with **', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    const textarea = page.locator('.dm-inline-editor textarea');
    await textarea.click(); // settle the focus-shim setTimeout in open()
    // Set value AND selection in one evaluate to avoid any focus/timing race.
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.value = 'hello world';
      el.setSelectionRange(0, 5);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page
      .locator('.dm-inline-editor-toolbar button[aria-label="Bold (Cmd/Ctrl+B)"]')
      .click();

    await expect(textarea).toHaveValue('**hello** world');
  });

  test('"Open in full editor" closes inline and opens dmEditModal', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');
    await page.locator('#note-viewer-edit').click();

    await expect(page.locator('.dm-inline-editor')).toHaveCount(1);
    await page.locator('.dm-inline-editor').getByRole('button', { name: 'Open in full editor' }).click();

    await expect(page.locator('.dm-inline-editor')).toHaveCount(0);
    // Modal becomes visible. The modal is included via inject/body.html and
    // toggled by setting style.display = ''.
    await expect(page.locator('#note-edit-modal')).toBeVisible();
    // Title input should reflect the seeded note.
    await expect(page.locator('#note-edit-title')).toHaveValue('Inline Editor Test');
  });

  test('opening Edit twice on the same note collapses the prior session', async ({ page }) => {
    await setupViewer(page, 'ie-note-1');

    await page.locator('#note-viewer-edit').click();
    await expect(page.locator('.dm-inline-editor')).toHaveCount(1);

    // Click Edit again — opening over an already-open editor should leave a
    // single inline editor instance (the second open call collapses+reopens).
    await page.locator('#note-viewer-edit').click();
    await expect(page.locator('.dm-inline-editor')).toHaveCount(1);
  });
});
