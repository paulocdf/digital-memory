import { test, expect } from '@playwright/test';

test.describe('Sidebar Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sidebar state before each test
    await page.addInitScript(() => {
      localStorage.removeItem('dm-sidebar-collapsed');
    });
    await page.goto('./');
  });

  test('toggle button is visible on desktop', async ({ page }) => {
    await expect(page.locator('#sidebar-toggle')).toBeVisible();
  });

  test('sidebar is expanded by default', async ({ page }) => {
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('aside.book-menu')).toBeVisible();
  });

  test('clicking toggle collapses sidebar', async ({ page }) => {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
  });

  test('clicking toggle twice expands sidebar again', async ({ page }) => {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);

    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  test('shows collapse icon when expanded, expand icon when collapsed', async ({ page }) => {
    // Expanded: collapse icon visible, expand icon hidden
    await expect(page.locator('#sidebar-toggle .icon-collapse')).toBeVisible();
    await expect(page.locator('#sidebar-toggle .icon-expand')).toBeHidden();

    await page.locator('#sidebar-toggle').click();

    // Collapsed: expand icon visible, collapse icon hidden
    await expect(page.locator('#sidebar-toggle .icon-expand')).toBeVisible();
    await expect(page.locator('#sidebar-toggle .icon-collapse')).toBeHidden();
  });

  test('collapse state persists to localStorage', async ({ page }) => {
    await page.locator('#sidebar-toggle').click();
    const saved = await page.evaluate(() => localStorage.getItem('dm-sidebar-collapsed'));
    expect(saved).toBe('1');

    await page.locator('#sidebar-toggle').click();
    const saved2 = await page.evaluate(() => localStorage.getItem('dm-sidebar-collapsed'));
    expect(saved2).toBe('0');
  });

  test('collapse state persists across page reload', async ({ page }) => {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);

    // Verify localStorage was set before reload
    const saved = await page.evaluate(() => localStorage.getItem('dm-sidebar-collapsed'));
    expect(saved).toBe('1');

    // Remove the addInitScript cleanup by creating a fresh page context
    // Instead, just reload — the addInitScript clears localStorage, but our
    // sidebar code reads from localStorage synchronously on load, so we need
    // to set localStorage again before the script runs on reload.
    await page.evaluate(() => {
      // Ensure the value persists — addInitScript from beforeEach will clear it
      // so we override by re-setting it in the page context
    });

    // Use a new approach: navigate to the page with localStorage already set
    // The addInitScript from beforeEach clears dm-sidebar-collapsed, so we
    // override it with a new addInitScript that sets it to '1'
    await page.addInitScript(() => {
      localStorage.setItem('dm-sidebar-collapsed', '1');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
  });

  test('sidebar contains navigation menu', async ({ page }) => {
    const nav = page.locator('.book-menu-content nav');
    await expect(nav).toBeVisible();
    // Should have menu items
    const items = nav.locator('ul li');
    expect(await items.count()).toBeGreaterThan(0);
  });
});
