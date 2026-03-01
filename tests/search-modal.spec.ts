import { test, expect } from '@playwright/test';

test.describe('Search Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('search modal is hidden by default', async ({ page }) => {
    await expect(page.locator('#search-modal')).not.toHaveClass(/active/);
  });

  test('sidebar search input exists', async ({ page }) => {
    await expect(page.locator('#book-search-input')).toBeVisible();
  });

  test('clicking sidebar search input opens modal', async ({ page }) => {
    await page.locator('#book-search-input').click();
    await expect(page.locator('#search-modal')).toHaveClass(/active/);
    await expect(page.locator('#search-modal-input')).toBeFocused();
  });

  test('Ctrl+K opens search modal', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);
    await expect(page.locator('#search-modal-input')).toBeFocused();
  });

  test('pressing s opens search modal', async ({ page }) => {
    await page.keyboard.press('s');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);
  });

  test('pressing / opens search modal', async ({ page }) => {
    await page.keyboard.press('/');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);
  });

  test('Escape closes search modal', async ({ page }) => {
    await page.keyboard.press('s');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#search-modal')).not.toHaveClass(/active/);
  });

  test('clicking backdrop closes search modal', async ({ page }) => {
    await page.keyboard.press('s');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);

    await page.locator('#search-modal-backdrop').click();
    await expect(page.locator('#search-modal')).not.toHaveClass(/active/);
  });

  test('search input accepts text', async ({ page }) => {
    await page.keyboard.press('s');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);

    await page.locator('#search-modal-input').fill('test query');
    await expect(page.locator('#search-modal-input')).toHaveValue('test query');
  });

  test('modal has results area and footer', async ({ page }) => {
    await page.keyboard.press('s');
    await expect(page.locator('#search-modal')).toHaveClass(/active/);

    await expect(page.locator('#search-modal-results')).toBeAttached();
    await expect(page.locator('.search-modal-footer')).toBeVisible();
  });
});
