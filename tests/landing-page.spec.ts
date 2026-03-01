import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    expect(errors).toEqual([]);
  });

  test('has garden stats section', async ({ page }) => {
    await expect(page.locator('.garden-stats')).toBeVisible();
  });

  test('stats section has stat cards', async ({ page }) => {
    const cards = page.locator('.stat-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
  });

  test('has stats for books, notes, tags, review', async ({ page }) => {
    await expect(page.locator('#stat-books')).toBeAttached();
    await expect(page.locator('#stat-notes')).toBeAttached();
    await expect(page.locator('#stat-tags')).toBeAttached();
    await expect(page.locator('#stat-review-due')).toBeAttached();
  });

  test('has garden sections', async ({ page }) => {
    await expect(page.locator('.garden-sections')).toBeVisible();
  });

  test('has section cards', async ({ page }) => {
    const cards = page.locator('.section-card');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('has inbox section card', async ({ page }) => {
    await expect(page.locator('.section-card.card-inbox')).toBeVisible();
  });

  test('has books section card', async ({ page }) => {
    await expect(page.locator('.section-card.card-books')).toBeVisible();
  });

  test('has topics section card', async ({ page }) => {
    await expect(page.locator('.section-card.card-topics')).toBeVisible();
  });

  test('has dashboard section card', async ({ page }) => {
    await expect(page.locator('.section-card.card-dashboard')).toBeVisible();
  });

  test('has graph container', async ({ page }) => {
    await expect(page.locator('.graph-container')).toBeVisible();
  });

  test('graph has view toggle buttons', async ({ page }) => {
    await expect(page.locator('.view-toggle-bar')).toBeVisible();
    await expect(page.locator('.view-toggle-btn[data-view="graph"]')).toBeVisible();
    await expect(page.locator('.view-toggle-btn[data-view="grid"]')).toBeVisible();
  });

  test('graph view toggle switches active view', async ({ page }) => {
    // Click grid view
    await page.locator('.view-toggle-btn[data-view="grid"]').click();
    await expect(page.locator('.view-toggle-btn[data-view="grid"]')).toHaveClass(/active/);

    // Click graph view
    await page.locator('.view-toggle-btn[data-view="graph"]').click();
    await expect(page.locator('.view-toggle-btn[data-view="graph"]')).toHaveClass(/active/);
  });

  test('has legend section', async ({ page }) => {
    await expect(page.locator('.graph-legend').first()).toBeAttached();
  });

  test('main layout structure is present', async ({ page }) => {
    await expect(page.locator('main.container')).toBeVisible();
    await expect(page.locator('aside.book-menu')).toBeVisible();
    await expect(page.locator('.book-page')).toBeVisible();
  });
});
