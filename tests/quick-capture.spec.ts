import { test, expect } from '@playwright/test';

test.describe('Quick Capture Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('FAB button is visible', async ({ page }) => {
    await expect(page.locator('#quick-capture-btn')).toBeVisible();
  });

  test('modal is hidden by default', async ({ page }) => {
    await expect(page.locator('#quick-capture-modal')).not.toHaveClass(/active/);
  });

  test('clicking FAB opens modal', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);
  });

  test('pressing Q opens modal', async ({ page }) => {
    await page.keyboard.press('q');
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);
  });

  test('Escape closes modal', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#quick-capture-modal')).not.toHaveClass(/active/);
  });

  test('clicking backdrop closes modal', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);

    // Click at the edge of the backdrop where the dialog doesn't overlap
    await page.locator('#quick-capture-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#quick-capture-modal')).not.toHaveClass(/active/);
  });

  test('has all 4 mode tabs', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);

    // Mode buttons may be in a scrollable row — check they are attached
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="ai"]')).toBeAttached();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]')).toBeAttached();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="code"]')).toBeAttached();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="todo"]')).toBeAttached();
  });

  test('switching to Note mode shows note UI', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);

    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]').click();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]')).toHaveClass(/active/);

    // Note mode shows title input and content textarea
    await expect(page.locator('#qc-title-input')).toBeVisible();
    await expect(page.locator('#quick-capture-input')).toBeVisible();
  });

  test('Note mode has markdown toolbar', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]').click();

    await expect(page.locator('#qc-toolbar')).toBeVisible();
    // Scope toolbar buttons to the quick capture toolbar to avoid strict mode violation
    await expect(page.locator('#qc-toolbar .qc-toolbar-btn[data-format="bold"]')).toBeVisible();
    await expect(page.locator('#qc-toolbar .qc-toolbar-btn[data-format="italic"]')).toBeVisible();
    await expect(page.locator('#qc-toolbar .qc-toolbar-btn[data-format="code"]')).toBeVisible();
  });

  test('Note mode has destination buttons', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]').click();

    await expect(page.locator('#qc-destination-row')).toBeVisible();
    await expect(page.locator('.qc-dest-btn[data-tag="inbox"]')).toBeVisible();
    await expect(page.locator('.qc-dest-btn[data-tag="topic"]')).toBeVisible();
    await expect(page.locator('.qc-dest-btn[data-tag="book-note"]')).toBeVisible();
  });

  test('switching to Code mode shows language buttons', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="code"]').click();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="code"]')).toHaveClass(/active/);

    await expect(page.locator('#qc-language-row')).toBeVisible();
    // Should have language buttons
    const langBtns = page.locator('.qc-lang-btn');
    expect(await langBtns.count()).toBeGreaterThan(0);
  });

  test('switching to Todo mode shows todo fields', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="todo"]').click();
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="todo"]')).toHaveClass(/active/);

    await expect(page.locator('#qc-todo-fields')).toBeVisible();
    await expect(page.locator('#qc-todo-title')).toBeVisible();
  });

  test('switching to AI mode shows AI chat UI', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    // Modal opens in AI mode by default, so AI container should be visible
    await expect(page.locator('#quick-capture-modal .qc-mode-btn[data-mode="ai"]')).toHaveClass(/active/);
    await expect(page.locator('#qc-ai-container')).toBeVisible();
  });

  test('has cancel and submit buttons in note mode', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    // Switch to note mode — cancel/submit are hidden in AI mode
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]').click();
    await expect(page.locator('#qc-cancel')).toBeVisible();
    await expect(page.locator('#qc-submit')).toBeVisible();
  });

  test('cancel button closes modal', async ({ page }) => {
    await page.locator('#quick-capture-btn').click();
    await expect(page.locator('#quick-capture-modal')).toHaveClass(/active/);

    // Switch to note mode so cancel button is visible
    await page.locator('#quick-capture-modal .qc-mode-btn[data-mode="note"]').click();
    await page.locator('#qc-cancel').click();
    await expect(page.locator('#quick-capture-modal')).not.toHaveClass(/active/);
  });
});
