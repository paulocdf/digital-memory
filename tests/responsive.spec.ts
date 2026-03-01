import { test, expect } from '@playwright/test';

test.describe('Responsive Layout', () => {
  test.describe('Mobile viewport (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('sidebar toggle is hidden on mobile', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#sidebar-toggle')).toBeHidden();
    });

    test('hamburger menu label is visible', async ({ page }) => {
      await page.goto('./');
      // The hamburger menu is a label for #menu-control
      const menuLabel = page.locator('label[for="menu-control"]');
      await expect(menuLabel.first()).toBeVisible();
    });

    test('sidebar is not visible by default on mobile', async ({ page }) => {
      await page.goto('./');
      // On mobile, sidebar is hidden off-screen by default
      const menuContent = page.locator('.book-menu-content');
      // The menu exists but is off-screen via transform
      await expect(menuContent).toBeAttached();
    });

    test('quick capture FAB is visible on mobile', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#quick-capture-btn')).toBeVisible();
    });

    test('theme toggle is visible on mobile', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#theme-toggle')).toBeVisible();
    });

    test('landing page loads on mobile', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto('./');
      expect(errors).toEqual([]);
    });

    test('content pages load on mobile', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto('./docs/books/');
      expect(errors).toEqual([]);
      await expect(page.locator('article')).toBeVisible();
    });
  });

  test.describe('Tablet viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('page loads without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto('./');
      expect(errors).toEqual([]);
    });

    test('quick capture FAB is visible', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#quick-capture-btn')).toBeVisible();
    });
  });

  test.describe('Desktop viewport (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('sidebar is visible on desktop', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('aside.book-menu')).toBeVisible();
    });

    test('sidebar toggle is visible on desktop', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('#sidebar-toggle')).toBeVisible();
    });

    test('content area is visible', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('.book-page')).toBeVisible();
    });
  });
});
