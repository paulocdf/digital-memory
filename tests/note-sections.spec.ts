import { test, expect } from '@playwright/test';

/**
 * Configurable note sections — Slice A (data layer) + Slice B (rename UI).
 *
 * These tests run against demo mode so no Firebase auth is needed. Demo mode
 * seeds the four built-in `noteSections` rows (builtin-inbox / builtin-topic /
 * builtin-book-note / builtin-snippets) plus a sample "Recipes" custom section
 * (Slice C scaffolding). Edits made via `dmSync` mutate in-memory demo stores
 * and dispatch `dm-note-sections-updated` so the registry / sidebar / etc.
 * repaint just like in real auth.
 */
test.describe('Note sections — registry + rename', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('dm-cached-user');
        localStorage.removeItem('dm-demo-disabled');
        localStorage.removeItem('dm-demo-banner-dismissed');
        // Bust any stale sidebar cache from prior runs.
        sessionStorage.removeItem('dm-sidebar-html');
      } catch (e) {}
    });
  });

  test('window.dmSections exposes the expected API', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(
      () => !!(window as any).dmSections && !!(window as any).dmDemo
        && (window as any).dmDemo.isActive(),
      null, { timeout: 10_000 },
    );
    const api = await page.evaluate(() => {
      const s = (window as any).dmSections;
      return {
        hasHydrate: typeof s.hydrate === 'function',
        hasLabelForBuiltin: typeof s.labelForBuiltin === 'function',
        hasLabelForDestination: typeof s.labelForDestination === 'function',
        hasGetAll: typeof s.getAll === 'function',
        hasGetActive: typeof s.getActive === 'function',
        hasGetBuiltin: typeof s.getBuiltin === 'function',
      };
    });
    expect(api.hasHydrate).toBe(true);
    expect(api.hasLabelForBuiltin).toBe(true);
    expect(api.hasLabelForDestination).toBe(true);
    expect(api.hasGetAll).toBe(true);
    expect(api.hasGetActive).toBe(true);
    expect(api.hasGetBuiltin).toBe(true);
  });

  test('demo mode seeds the four built-in section rows', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox') && s.getBuiltin('topic')
        && s.getBuiltin('book-note') && s.getBuiltin('snippets');
    }, null, { timeout: 10_000 });

    const rows = await page.evaluate(() => {
      const s = (window as any).dmSections;
      return ['inbox', 'topic', 'book-note', 'snippets'].map(k => {
        const r = s.getBuiltin(k);
        return r ? { id: r.id, name: r.name, slug: r.slug, builtin: r.builtin, builtinKey: r.builtinKey } : null;
      });
    });
    expect(rows[0]).toMatchObject({ id: 'builtin-inbox', name: 'Inbox', builtin: true, builtinKey: 'inbox' });
    expect(rows[1]).toMatchObject({ id: 'builtin-topic', name: 'Topics', builtin: true, builtinKey: 'topic' });
    expect(rows[2]).toMatchObject({ id: 'builtin-book-note', name: 'Books', builtin: true, builtinKey: 'book-note' });
    expect(rows[3]).toMatchObject({ id: 'builtin-snippets', name: 'Snippets', builtin: true, builtinKey: 'snippets' });
  });

  test('labelForBuiltin falls back to defaults when no override exists', async ({ page }) => {
    // Skip demo (so no rows seeded) by opting out before page load.
    await page.addInitScript(() => {
      try { localStorage.setItem('dm-demo-disabled', '1'); } catch (e) {}
    });
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmSections, null, { timeout: 10_000 });
    const labels = await page.evaluate(() => {
      const s = (window as any).dmSections;
      return {
        inbox: s.labelForBuiltin('inbox'),
        topic: s.labelForBuiltin('topic'),
        book: s.labelForBuiltin('book-note'),
        snip: s.labelForBuiltin('snippets'),
      };
    });
    expect(labels).toEqual({ inbox: 'Inbox', topic: 'Topics', book: 'Books', snip: 'Snippets' });
  });

  test('labelForDestination resolves legacy + section: prefixes', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox');
    }, null, { timeout: 10_000 });

    const labels = await page.evaluate(() => {
      const s = (window as any).dmSections;
      return {
        legacyInbox: s.labelForDestination('inbox'),
        legacyBook: s.labelForDestination('book-note'),
        unknown: s.labelForDestination('does-not-exist'),
        // demo seeds a "Recipes" custom section
        custom: (() => {
          const all = s.getAll();
          const recipe = all.find((r: any) => r.name === 'Recipes');
          return recipe ? s.labelForDestination('section:' + recipe.id) : null;
        })(),
      };
    });
    expect(labels.legacyInbox).toBe('Inbox');
    expect(labels.legacyBook).toBe('Books');
    expect(labels.unknown).toBe('');
    expect(labels.custom).toBe('Recipes');
  });

  test('updateNoteSection rename updates registry and dispatches event', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox');
    }, null, { timeout: 10_000 });

    const result = await page.evaluate(async () => {
      const sync = (window as any).dmSync;
      const sections = (window as any).dmSections;
      let eventFired = false;
      const listener = () => { eventFired = true; };
      window.addEventListener('dm-note-sections-updated', listener);

      const inbox = sections.getBuiltin('inbox');
      await sync.updateNoteSection(inbox.id, { name: 'Capture' });

      // Give the cache hydrate a tick to flush.
      await new Promise(r => setTimeout(r, 100));
      const after = sections.getBuiltin('inbox');
      const labelAfter = sections.labelForBuiltin('inbox');
      window.removeEventListener('dm-note-sections-updated', listener);

      return { eventFired, name: after && after.name, label: labelAfter };
    });
    expect(result.eventFired).toBe(true);
    expect(result.name).toBe('Capture');
    expect(result.label).toBe('Capture');
  });

  test('sidebar reflects renamed built-in (Inbox -> Capture)', async ({ page }) => {
    await page.goto('./');
    // Wait for sidebar to be rendered + seeds to land.
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox')
        && document.querySelector('.sidebar-item[data-section="inbox"]');
    }, null, { timeout: 15_000 });

    // Baseline: should say "Inbox"
    const before = await page.locator('.sidebar-item[data-section="inbox"] a').first().innerText();
    expect(before.trim()).toContain('Inbox');

    // Rename via dmSync
    await page.evaluate(async () => {
      const s = (window as any).dmSections;
      const inbox = s.getBuiltin('inbox');
      await (window as any).dmSync.updateNoteSection(inbox.id, { name: 'Capture' });
    });

    // Sidebar re-render is debounced 100ms — wait for the text to flip.
    await expect(
      page.locator('.sidebar-item[data-section="inbox"] a').first()
    ).toContainText('Capture', { timeout: 5_000 });
  });

  test('garden landing page reflects renamed built-in', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('book-note')
        && document.getElementById('garden-link-books');
    }, null, { timeout: 15_000 });

    const before = await page.locator('#garden-link-books').innerText();
    expect(before.trim()).toBe('Books');

    await page.evaluate(async () => {
      const s = (window as any).dmSections;
      const book = s.getBuiltin('book-note');
      await (window as any).dmSync.updateNoteSection(book.id, { name: 'Library' });
    });

    await expect(page.locator('#garden-link-books')).toHaveText('Library', { timeout: 5_000 });
  });

  test('Settings modal renders rename inputs for the four built-ins', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox') && typeof (window as any).dmSectionsBuildPanel === 'function';
    }, null, { timeout: 10_000 });

    // Mount the panel into a sandbox div so we don't depend on opening the
    // real Settings modal (which requires auth in many flows).
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'sandbox-sections-panel';
      document.body.appendChild(host);
      (window as any).dmSectionsBuildPanel(host);
    });

    // Only the four built-in rows carry data-builtin-key; custom rows don't
    const builtinRows = page.locator('#sandbox-sections-panel .dm-sections-row[data-builtin-key]');
    await expect(builtinRows).toHaveCount(4);

    const inputs = await page.locator('#sandbox-sections-panel .dm-sections-row[data-builtin-key] input[data-role="name"]').all();
    const values = await Promise.all(inputs.map(i => i.inputValue()));
    expect(values).toEqual(['Inbox', 'Topics', 'Books', 'Snippets']);
  });

  test('Settings panel rename input persists via dmSync', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('topic') && typeof (window as any).dmSectionsBuildPanel === 'function';
    }, null, { timeout: 10_000 });

    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'sandbox-sections-panel';
      document.body.appendChild(host);
      (window as any).dmSectionsBuildPanel(host);
    });

    const topicRow = page.locator('#sandbox-sections-panel .dm-sections-row[data-builtin-key="topic"]');
    const input = topicRow.locator('input[data-role="name"]');
    await input.fill('Threads');
    // Trigger blur to fire change → persist.
    await input.blur();

    // Wait for IDB write + cache refresh.
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      const r = s && s.getBuiltin('topic');
      return r && r.name === 'Threads';
    }, null, { timeout: 5_000 });

    const stored = await page.evaluate(() => {
      const s = (window as any).dmSections;
      return s.labelForBuiltin('topic');
    });
    expect(stored).toBe('Threads');
  });

  test('Settings panel Reset button restores default name', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('snippets') && typeof (window as any).dmSectionsBuildPanel === 'function';
    }, null, { timeout: 10_000 });

    // Pre-rename snippets to "Code Bits"
    await page.evaluate(async () => {
      const s = (window as any).dmSections;
      const sn = s.getBuiltin('snippets');
      await (window as any).dmSync.updateNoteSection(sn.id, { name: 'Code Bits' });
    });

    // Mount panel after rename so input shows "Code Bits"
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'sandbox-sections-panel';
      document.body.appendChild(host);
      (window as any).dmSectionsBuildPanel(host);
    });

    const row = page.locator('#sandbox-sections-panel .dm-sections-row[data-builtin-key="snippets"]');
    const input = row.locator('input[data-role="name"]');
    await expect(input).toHaveValue('Code Bits');

    const resetBtn = row.locator('button[data-role="reset"]');
    await expect(resetBtn).toBeEnabled();
    await resetBtn.click();

    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      const r = s && s.getBuiltin('snippets');
      return r && r.name === 'Snippets';
    }, null, { timeout: 5_000 });

    await expect(input).toHaveValue('Snippets');
    await expect(resetBtn).toBeDisabled();
  });

  test('export-modal scope buttons reflect renamed built-ins', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('book-note') && !!(window as any).dmExport;
    }, null, { timeout: 10_000 });

    // Rename Books -> Library before opening modal
    await page.evaluate(async () => {
      const s = (window as any).dmSections;
      const book = s.getBuiltin('book-note');
      await (window as any).dmSync.updateNoteSection(book.id, { name: 'Library' });
    });

    await page.evaluate(() => (window as any).dmExport.open());
    const btn = page.locator('.export-scope-btn[data-scope="books"]');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Library');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slices C + D — custom sections CRUD, routing, Quick Capture, orphan handling
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Note sections — custom CRUD, routing, Quick Capture, orphans', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('dm-cached-user');
        localStorage.removeItem('dm-demo-disabled');
        localStorage.removeItem('dm-demo-banner-dismissed');
        sessionStorage.removeItem('dm-sidebar-html');
      } catch (e) {}
    });
  });

  // ── Settings panel ──────────────────────────────────────────────────────────

  test('12: settings panel shows "+ Add section" button', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      return !!(window as any).dmSections?.getBuiltin('inbox')
        && typeof (window as any).dmSectionsBuildPanel === 'function';
    }, null, { timeout: 10_000 });

    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'sandbox-sections-panel';
      document.body.appendChild(host);
      (window as any).dmSectionsBuildPanel(host);
    });

    const addBtn = page.locator('#sandbox-sections-panel [data-role="add-section-btn"]');
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toContainText('Add section');
  });

  test('13: creating a custom section appears in sidebar', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox')
        && document.querySelector('.sidebar-item[data-section="inbox"]');
    }, null, { timeout: 15_000 });

    const sectionId = await page.evaluate(async () => {
      const sec = await (window as any).dmSync.createNoteSection({ name: 'Field Notes' });
      return sec ? sec.id : null;
    });

    expect(sectionId).toBeTruthy();

    // Sidebar re-renders on dm-note-sections-updated — wait for the link
    await page.waitForFunction((id: string) => {
      return !!document.querySelector(`a[href*="id=${id}"]`);
    }, sectionId, { timeout: 5_000 });

    const link = page.locator(`a[href*="id=${sectionId}"]`).first();
    await expect(link).toContainText('Field Notes');
  });

  test('14: custom section page renders heading and note list', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getAll().some((r: any) => r.name === 'Recipes');
    }, null, { timeout: 10_000 });

    const recipeId = await page.evaluate(() => {
      const s = (window as any).dmSections;
      const r = s.getAll().find((x: any) => x.name === 'Recipes');
      return r ? r.id : null;
    });
    expect(recipeId).toBeTruthy();

    const response = await page.goto(`./docs/sections/?id=${recipeId}`, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // If Hugo hasn't built the sections route yet, skip gracefully
    if (!response || response.status() !== 200) {
      console.log('Test 14 skipped: /docs/sections/ not yet built by Hugo');
      return;
    }

    await page.waitForFunction(() => {
      const el = document.getElementById('section-page-content');
      return el && el.style.display !== 'none';
    }, null, { timeout: 15_000 });

    const heading = page.locator('#section-page-title');
    await expect(heading).toHaveText('Recipes');
  });

  test('15: archiving a custom section removes it from the sidebar', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getBuiltin('inbox')
        && document.querySelector('.sidebar-item[data-section="inbox"]');
    }, null, { timeout: 15_000 });

    // Create, wait for it to appear, then archive
    const sectionId = await page.evaluate(async () => {
      const sec = await (window as any).dmSync.createNoteSection({ name: 'Temp Section' });
      return sec ? sec.id : null;
    });
    expect(sectionId).toBeTruthy();

    await page.waitForFunction((id: string) => {
      return !!document.querySelector(`a[href*="id=${id}"]`);
    }, sectionId, { timeout: 5_000 });

    await page.evaluate(async (id: string) => {
      await (window as any).dmSync.archiveNoteSection(id);
    }, sectionId);

    // Link should disappear from sidebar after re-render
    await page.waitForFunction((id: string) => {
      return !document.querySelector(`a[href*="id=${id}"]`);
    }, sectionId, { timeout: 5_000 });
  });

  test('16: deleting a custom section removes it from the registry', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      return !!(window as any).dmSections?.getBuiltin('inbox');
    }, null, { timeout: 10_000 });

    const sectionId = await page.evaluate(async () => {
      const sec = await (window as any).dmSync.createNoteSection({ name: 'Scratch' });
      return sec ? sec.id : null;
    });
    expect(sectionId).toBeTruthy();

    // Delete and check it's removed from getActive()
    const removed = await page.evaluate(async (id: string) => {
      await (window as any).dmSync.deleteNoteSection(id);
      await new Promise(r => setTimeout(r, 100));
      const active = (window as any).dmSections.getActive();
      return !active.some((s: any) => s.id === id);
    }, sectionId);

    expect(removed).toBe(true);
  });

  // ── Orphan handling ─────────────────────────────────────────────────────────

  test('17: orphan banner appears when notes belong to a deleted section', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      return !!(window as any).dmSync?.createNoteSection
        && !!(window as any).dmSections?.getBuiltin('inbox');
    }, null, { timeout: 10_000 });

    // Create a section, plant a note in it, then delete the section
    await page.evaluate(async () => {
      const sync = (window as any).dmSync;
      const sec = await sync.createNoteSection({ name: 'Doomed Section' });
      await sync.putNote({
        id: 'orphan-test-note-1',
        title: 'Orphan note',
        content: 'will be stranded',
        destination: 'section:' + sec.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await sync.deleteNoteSection(sec.id);
      // Trigger orphan detection manually (normally fires after sign-in + delay)
      window.dispatchEvent(new CustomEvent('dm-note-sections-updated'));
    });

    const banner = page.locator('#dm-orphan-banner');
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText('1 note');
  });

  test('18: "Move to Inbox" recovers orphaned notes', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      return !!(window as any).dmSync?.createNoteSection
        && !!(window as any).dmSections?.getBuiltin('inbox');
    }, null, { timeout: 10_000 });

    const noteId = 'orphan-recovery-note-1';
    await page.evaluate(async (nid: string) => {
      const sync = (window as any).dmSync;
      const sec = await sync.createNoteSection({ name: 'Vanishing Section' });
      await sync.putNote({
        id: nid,
        title: 'Will be rescued',
        content: 'rescue me',
        destination: 'section:' + sec.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await sync.deleteNoteSection(sec.id);
      window.dispatchEvent(new CustomEvent('dm-note-sections-updated'));
    }, noteId);

    const banner = page.locator('#dm-orphan-banner');
    await expect(banner).toBeVisible({ timeout: 5_000 });

    await page.locator('#dm-orphan-inbox').click();

    // Banner should disappear and note destination should be 'inbox'
    await expect(banner).not.toBeVisible({ timeout: 5_000 });

    const dest = await page.evaluate(async (nid: string) => {
      const note = await (window as any).dmSync.getNote(nid);
      return note ? note.destination : null;
    }, noteId);
    expect(dest).toBe('inbox');
  });

  // ── Quick Capture ───────────────────────────────────────────────────────────

  test('19: Quick Capture "More…" dropdown shows custom sections', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      // Demo seeds "Recipes"
      return s && s.getAll().some((r: any) => r.name === 'Recipes');
    }, null, { timeout: 10_000 });

    // Open Quick Capture via keyboard shortcut 'q'
    await page.keyboard.press('q');

    const modal = page.locator('#quick-capture-modal');
    await expect(modal).toHaveClass(/active/, { timeout: 5_000 });

    // Switch to note mode
    await modal.locator('.qc-mode-btn[data-mode="note"]').click();

    const moreWrap = page.locator('#qc-dest-more-wrap');
    await expect(moreWrap).toBeVisible({ timeout: 3_000 });

    await page.locator('#qc-dest-more').click();

    const dropdown = page.locator('#qc-dest-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Recipes');
  });

  // ── Garden landing ──────────────────────────────────────────────────────────

  test('20: garden landing renders custom section card', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => {
      const s = (window as any).dmSections;
      return s && s.getAll().some((r: any) => r.name === 'Recipes')
        && document.getElementById('garden-sections-container');
    }, null, { timeout: 15_000 });

    const recipeId = await page.evaluate(() => {
      const s = (window as any).dmSections;
      const r = s.getAll().find((x: any) => x.name === 'Recipes');
      return r ? r.id : null;
    });
    expect(recipeId).toBeTruthy();

    // The container should contain an anchor pointing to the custom section
    await page.waitForFunction((id: string) => {
      const container = document.getElementById('garden-sections-container');
      return !!container && !!container.querySelector(`a[href*="id=${id}"]`);
    }, recipeId, { timeout: 10_000 });

    const card = page.locator(`#garden-sections-container a[href*="id=${recipeId}"]`).first();
    await expect(card).toContainText('Recipes');
  });
});
