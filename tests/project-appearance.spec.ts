import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  seedProject,
  seedTodo,
  seedIdb,
  cleanupIdb,
  getIdbRecord,
  waitForDmSync,
  makeProject,
  makeTodo,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const PROJECT_ID = 'pa-project-1';
const TODO_IDS = ['pa-todo-1', 'pa-todo-2', 'pa-setup'];

/** Navigate to projects page and wait for dmSync to be ready. */
async function setupProjects(page: Page) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/projects/');
  await waitForDmSync(page);
}

/** Set up the kanban board with one project active in the filter. */
async function setupKanbanWithProject(page: Page, project: any) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/board/');
  await waitForDmSync(page);

  // Seed the 3 default columns (handleSyncAuth wipes them on fresh context)
  const uid = MOCK_USER.uid;
  const now = Date.now();
  await seedIdb(page, 'kanbanColumns', [
    { id: uid + '_col_todo',        userId: uid, name: 'To Do',       status: 'todo',        color: '#42a5f5', order: 0, isDoneColumn: false, createdAt: now, updatedAt: now },
    { id: uid + '_col_in_progress', userId: uid, name: 'In Progress', status: 'in_progress', color: '#ffa726', order: 1, isDoneColumn: false, createdAt: now, updatedAt: now },
    { id: uid + '_col_done',        userId: uid, name: 'Done',        status: 'done',        color: '#66bb6a', order: 2, isDoneColumn: true,  createdAt: now, updatedAt: now },
  ]);
  await seedProject(page, project);
  // Seed a task in this project so the column has a card to render
  const task = makeTodo('pa-setup', 'Setup task', uid, {
    projectId: project.id,
    kanbanStatus: 'todo',
    kanbanOrder: 1000,
  });
  await seedTodo(page, task);
  // Persist the project filter so loadBoard picks it up on the next sync
  await page.evaluate((pid) => (window as any).dmSync.setPageFilterProjectIds('kanban', [pid]), project.id);
  // Dispatch dm-sync-complete to trigger loadBoard which reads the filter
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-sync-complete')));
  await page.waitForSelector('[data-kanban-status]', { timeout: 10_000 });
  await page.waitForTimeout(300); // let renderBoard finish applying theme
}

// ─────────────────────────────────────────────
// Group 1 — Theme registry
// ─────────────────────────────────────────────

test.describe('Project Appearance — Theme registry', () => {
  test.slow();
  test('window.dmProjectThemes contains all 10 named themes', async ({ page }) => {
    await setupProjects(page);
    const themes = await page.evaluate(() => Object.keys((window as any).dmProjectThemes));
    expect(themes.sort()).toEqual([
      'citrus', 'default', 'forest', 'lavender', 'mono',
      'neon', 'ocean', 'paper', 'sunset', 'terminal',
    ]);
  });

  test('dmGetProjectTheme(id) returns the full theme config for a known id', async ({ page }) => {
    await setupProjects(page);
    const theme = await page.evaluate(() => (window as any).dmGetProjectTheme('ocean'));
    expect(theme).toMatchObject({
      name: 'Ocean',
      icon: 'waves',
      accent: '#0288d1',
      pattern: 'dots',
      bannerStyle: 'gradient',
    });
  });

  test('dmGetProjectTheme returns null for unknown id', async ({ page }) => {
    await setupProjects(page);
    const result = await page.evaluate(() => (window as any).dmGetProjectTheme('nope'));
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Group 2 — dmApplyProjectTheme
// ─────────────────────────────────────────────

test.describe('Project Appearance — dmApplyProjectTheme()', () => {
  test('sets data-* attributes and CSS variables on the root element', async ({ page }) => {
    await setupProjects(page);
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      (window as any).dmApplyProjectTheme(el, {
        themeId: 'ocean',
        pattern: 'dots',
        density: 'comfy',
        cardShape: 'rounded',
        fontFamily: 'sans',
        accent: '#0288d1',
        accent2: '#4fc3f7',
      });
      return {
        theme: el.getAttribute('data-project-theme'),
        pattern: el.getAttribute('data-pj-pattern'),
        density: el.getAttribute('data-pj-density'),
        shape: el.getAttribute('data-pj-shape'),
        font: el.getAttribute('data-pj-font'),
        accent: el.style.getPropertyValue('--pj-accent'),
        accent2: el.style.getPropertyValue('--pj-accent2'),
      };
    });
    expect(result).toEqual({
      theme: 'ocean',
      pattern: 'dots',
      density: 'comfy',
      shape: 'rounded',
      font: 'sans',
      accent: '#0288d1',
      accent2: '#4fc3f7',
    });
  });

  test('passing null clears all theme attributes and CSS variables', async ({ page }) => {
    await setupProjects(page);
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      (window as any).dmApplyProjectTheme(el, {
        themeId: 'ocean', pattern: 'dots', density: 'comfy',
        cardShape: 'rounded', fontFamily: 'sans',
        accent: '#0288d1', accent2: '#4fc3f7',
      });
      (window as any).dmApplyProjectTheme(el, null);
      return {
        theme: el.getAttribute('data-project-theme'),
        pattern: el.getAttribute('data-pj-pattern'),
        density: el.getAttribute('data-pj-density'),
        shape: el.getAttribute('data-pj-shape'),
        font: el.getAttribute('data-pj-font'),
        accent: el.style.getPropertyValue('--pj-accent'),
        accent2: el.style.getPropertyValue('--pj-accent2'),
      };
    });
    expect(result.theme).toBeNull();
    expect(result.pattern).toBeNull();
    expect(result.density).toBeNull();
    expect(result.shape).toBeNull();
    expect(result.font).toBeNull();
    expect(result.accent).toBe('');
    expect(result.accent2).toBe('');
  });

  test('project-level overrides win over the theme preset', async ({ page }) => {
    await setupProjects(page);
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      // Project says theme=ocean but overrides accent + pattern
      (window as any).dmApplyProjectTheme(el, {
        themeId: 'ocean',
        accent: '#ff0000',
        pattern: 'noise',
      });
      return {
        accent: el.style.getPropertyValue('--pj-accent'),
        pattern: el.getAttribute('data-pj-pattern'),
      };
    });
    expect(result.accent).toBe('#ff0000');
    expect(result.pattern).toBe('noise');
  });

  test('falls back to project.color when accent is not set', async ({ page }) => {
    await setupProjects(page);
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      (window as any).dmApplyProjectTheme(el, {
        themeId: 'default',
        color: '#abcdef',
      });
      return el.style.getPropertyValue('--pj-accent');
    });
    expect(result).toBe('#abcdef');
  });
});

// ─────────────────────────────────────────────
// Group 3 — Project save round-trip
// ─────────────────────────────────────────────

test.describe('Project Appearance — Save round-trip (IDB persistence)', () => {
  test.slow();
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'projects', [PROJECT_ID]);
  });

  test('updateProject persists all 11 visual identity fields to IDB', async ({ page }) => {
    await setupProjects(page);
    const seed = makeProject(PROJECT_ID, 'Test Project', MOCK_USER.uid);
    await seedProject(page, seed);

    await page.evaluate((id) => (window as any).dmSync.updateProject(id, {
      themeId: 'ocean',
      icon: 'waves',
      emoji: '🌊',
      accent: '#0288d1',
      accent2: '#4fc3f7',
      bannerStyle: 'gradient',
      pattern: 'dots',
      density: 'comfy',
      cardShape: 'rounded',
      fontFamily: 'sans',
      kanbanColumnStyles: { 'col-todo': { accent: '#ff0000', emoji: '🔥' } },
    }), PROJECT_ID);

    const stored = await getIdbRecord(page, 'projects', PROJECT_ID);
    expect(stored).toMatchObject({
      themeId: 'ocean',
      icon: 'waves',
      emoji: '🌊',
      accent: '#0288d1',
      accent2: '#4fc3f7',
      bannerStyle: 'gradient',
      pattern: 'dots',
      density: 'comfy',
      cardShape: 'rounded',
      fontFamily: 'sans',
    });
    expect(stored.kanbanColumnStyles).toEqual({ 'col-todo': { accent: '#ff0000', emoji: '🔥' } });
  });

  test('createProject persists visual identity fields on insert', async ({ page }) => {
    await setupProjects(page);
    const id = await page.evaluate(() => (window as any).dmSync.createProject({
      name: 'Brand New',
      color: '#1976d2',
      themeId: 'sunset',
      icon: 'sun',
      emoji: null,
      accent: '#f57c00',
      accent2: '#ff8a65',
      bannerStyle: 'gradient',
      pattern: 'noise',
      density: 'comfy',
      cardShape: 'rounded',
      fontFamily: 'serif',
    }).then((p: any) => p.id));

    const stored = await getIdbRecord(page, 'projects', id);
    expect(stored).toMatchObject({
      name: 'Brand New',
      themeId: 'sunset',
      icon: 'sun',
      accent: '#f57c00',
      bannerStyle: 'gradient',
      pattern: 'noise',
      fontFamily: 'serif',
    });
    await cleanupIdb(page, 'projects', [id]);
  });

  test('round-trip via _pjTest.openModal preserves themeId on save', async ({ page }) => {
    await setupProjects(page);
    const seed = makeProject(PROJECT_ID, 'Modal Project', MOCK_USER.uid, { themeId: 'ocean' });
    await seedProject(page, seed);

    // Drive UI: openModal, click 'sunset' theme swatch, click Save
    await page.evaluate((id) => {
      const t = (window as any)._pjTest;
      t.setProjects([{ ...((window as any)._modalSeed || {}), id, name: 'Modal Project', themeId: 'ocean' }]);
      t.openModal(id);
    }, PROJECT_ID);

    await page.locator('.pj-theme-swatch[data-theme-id="sunset"]').click();
    await page.locator('#project-modal-save').click();
    // Poll IDB until the update lands rather than fixed timeout
    await page.waitForFunction(async (id) => {
      const dmSync = (window as any).dmSync;
      const p = await dmSync.getProject(id);
      return p && p.themeId === 'sunset';
    }, PROJECT_ID, { timeout: 5000 });

    const stored = await getIdbRecord(page, 'projects', PROJECT_ID);
    expect(stored.themeId).toBe('sunset');
  });
});

// ─────────────────────────────────────────────
// Group 4 — Detail header theming
// ─────────────────────────────────────────────

test.describe('Project Appearance — Detail header', () => {
  test.slow();
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'projects', [PROJECT_ID]);
  });

  test('header renders with emoji + name from project fields', async ({ page }) => {
    await setupProjects(page);
    const project = makeProject(PROJECT_ID, 'Sunset Adventures', MOCK_USER.uid, {
      themeId: 'sunset',
      emoji: '🌅',
      bannerStyle: 'gradient',
      pattern: 'noise',
      accent: '#f57c00',
    });
    await seedProject(page, project);

    await page.evaluate((p) => {
      const t = (window as any)._pjTest;
      t.setProjects([p]);
      t.showDetail(p.id);
    }, project);

    const header = page.locator('.project-detail-header');
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute('data-banner-style', 'gradient');
    await expect(header).toHaveAttribute('data-pj-pattern', 'noise');
    await expect(header.locator('.pj-glyph-emoji')).toHaveText('🌅');
    await expect(header.locator('#project-detail-name')).toHaveText('Sunset Adventures');
  });

  test('header has data-banner-style="none" when project bannerStyle is "none"', async ({ page }) => {
    await setupProjects(page);
    const project = makeProject(PROJECT_ID, 'Quiet Project', MOCK_USER.uid, {
      themeId: 'mono',
      bannerStyle: 'none',
    });
    await seedProject(page, project);

    await page.evaluate((p) => {
      const t = (window as any)._pjTest;
      t.setProjects([p]);
      t.showDetail(p.id);
    }, project);

    const header = page.locator('.project-detail-header');
    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute('data-banner-style', 'none');
    // The legacy stand-alone banner element no longer exists.
    await expect(page.locator('#pj-detail-banner')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────
// Group 5 — Task flair on inbox
// ─────────────────────────────────────────────

test.describe('Project Appearance — Task flair (inbox)', () => {
  test.slow();
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
    await cleanupIdb(page, 'notes', ['pa-inbox-note']);
  });

  async function setupInbox(page: Page) {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
    await seedIdb(page, 'notes', [{
      id: 'pa-inbox-note',
      title: 'Inbox',
      content: '',
      mode: 'note',
      destination: 'inbox',
      tags: [],
      userId: MOCK_USER.uid,
      userEmail: MOCK_USER.email,
      userName: MOCK_USER.displayName,
      pinned: false,
      collaborators: [MOCK_USER.uid],
      deletedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }]);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-sync-complete')));
    await page.waitForFunction(
      () => {
        const el = document.getElementById('todo-list');
        return !!el && getComputedStyle(el).display !== 'none';
      },
      { timeout: 10_000 },
    );
  }

  test('priority dot uses [data-priority] selector and inherits color', async ({ page }) => {
    await setupInbox(page);
    await seedTodo(page, makeTodo('pa-todo-1', 'Urgent task', MOCK_USER.uid, {
      priority: 'urgent',
    }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-todos-updated')));
    await page.waitForSelector('[data-todo-id="pa-todo-1"]', { timeout: 10_000 });

    const dot = page.locator('[data-todo-id="pa-todo-1"] .todo-priority-dot');
    await expect(dot).toHaveCount(1, { timeout: 5000 });
    await expect(dot).toHaveAttribute('data-priority', 'urgent');
  });

  test('emoji and labels render on the task row', async ({ page }) => {
    await setupInbox(page);
    await seedTodo(page, makeTodo('pa-todo-1', 'Decorated task', MOCK_USER.uid, {
      emoji: '🎨',
      labels: ['design', 'frontend'],
    }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-todos-updated')));
    await page.waitForSelector('[data-todo-id="pa-todo-1"]', { timeout: 10_000 });

    const row = page.locator('[data-todo-id="pa-todo-1"]');
    await expect(row.locator('.todo-item-emoji')).toHaveText('🎨');
    const chips = row.locator('.todo-label-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toHaveText('design');
    await expect(chips.nth(1)).toHaveText('frontend');
  });

  test('borderStyle="glow" sets data-border-style and produces non-empty box-shadow', async ({ page }) => {
    await setupInbox(page);
    await seedTodo(page, makeTodo('pa-todo-1', 'Glow task', MOCK_USER.uid, {
      borderStyle: 'glow',
    }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-todos-updated')));
    await page.waitForSelector('[data-todo-id="pa-todo-1"]', { timeout: 10_000 });

    const row = page.locator('[data-todo-id="pa-todo-1"]');
    await expect(row).toHaveAttribute('data-border-style', 'glow');
    const shadow = await row.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');
    expect(shadow.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Group 6 — Task flair on kanban
// ─────────────────────────────────────────────

test.describe('Project Appearance — Task flair (kanban)', () => {
  test.slow();
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('kanban card carries data-priority dot, emoji, labels and data-border-style', async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/board/');
    await waitForDmSync(page);
    const uid = MOCK_USER.uid;
    const now = Date.now();
    await seedIdb(page, 'kanbanColumns', [
      { id: uid + '_col_todo', userId: uid, name: 'To Do', status: 'todo', color: '#42a5f5', order: 0, isDoneColumn: false, createdAt: now, updatedAt: now },
      { id: uid + '_col_in_progress', userId: uid, name: 'In Progress', status: 'in_progress', color: '#ffa726', order: 1, isDoneColumn: false, createdAt: now, updatedAt: now },
      { id: uid + '_col_done', userId: uid, name: 'Done', status: 'done', color: '#66bb6a', order: 2, isDoneColumn: true, createdAt: now, updatedAt: now },
    ]);
    await seedTodo(page, makeTodo('pa-todo-1', 'Flair card', uid, {
      kanbanStatus: 'todo',
      priority: 'high',
      emoji: '🚀',
      labels: ['ship-it'],
      borderStyle: 'dashed',
    }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-sync-complete')));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dm-todos-updated')));
    await page.waitForSelector('[data-todo-id="pa-todo-1"]', { timeout: 10_000 });

    const card = page.locator('[data-todo-id="pa-todo-1"]');
    await expect(card).toHaveAttribute('data-border-style', 'dashed');
    await expect(card.locator('.todo-priority-dot')).toHaveCount(1, { timeout: 5000 });
    await expect(card.locator('.todo-priority-dot')).toHaveAttribute('data-priority', 'high');
    await expect(card.locator('.todo-label-chip').first()).toHaveText('ship-it');
  });
});

// ─────────────────────────────────────────────
// Group 7 — Kanban project theme + per-column overrides
// ─────────────────────────────────────────────

test.describe('Project Appearance — Kanban project theme', () => {
  test.slow();
  test.afterEach(async ({ page }) => {
    await cleanupIdb(page, 'projects', [PROJECT_ID]);
    await cleanupIdb(page, 'todos', TODO_IDS);
  });

  test('filtering kanban to a single project sets data-project-theme on #kanban', async ({ page }) => {
    const project = makeProject(PROJECT_ID, 'Themed Project', MOCK_USER.uid, {
      themeId: 'forest',
      accent: '#2e7d32',
      pattern: 'paper',
      density: 'spacious',
    });
    await setupKanbanWithProject(page, project);

    const kanban = page.locator('#kanban');
    await expect(kanban).toHaveAttribute('data-project-theme', 'forest');
    await expect(kanban).toHaveAttribute('data-pj-pattern', 'paper');
    await expect(kanban).toHaveAttribute('data-pj-density', 'spacious');
  });

  test('kanbanColumnStyles override sets data-pj-col-style and emoji on the column', async ({ page }) => {
    const project = makeProject(PROJECT_ID, 'Custom Cols', MOCK_USER.uid, {
      themeId: 'default',
      kanbanColumnStyles: {
        [MOCK_USER.uid + '_col_todo']: { accent: '#e91e63', emoji: '🌟' },
      },
    });
    await setupKanbanWithProject(page, project);

    const todoCol = page.locator('[data-kanban-col-id="' + MOCK_USER.uid + '_col_todo"]');
    await expect(todoCol).toHaveAttribute('data-pj-col-style', '1');
    const accentVar = await todoCol.evaluate((el) =>
      (el as HTMLElement).style.getPropertyValue('--kb-col-accent'),
    );
    expect(accentVar).toBe('#e91e63');
    await expect(todoCol.locator('.kanban-col-name')).toHaveAttribute('data-emoji', '🌟');
  });
});
