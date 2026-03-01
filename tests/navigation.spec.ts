import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('landing page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    expect(errors).toEqual([]);
  });

  test('books page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/books/');
    expect(errors).toEqual([]);
    await expect(page.locator('article')).toBeVisible();
  });

  test('topics page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/topics/');
    expect(errors).toEqual([]);
    await expect(page.locator('article')).toBeVisible();
  });

  test('snippets page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/snippets/');
    expect(errors).toEqual([]);
    await expect(page.locator('article')).toBeVisible();
  });

  test('inbox page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/inbox/');
    expect(errors).toEqual([]);
    await expect(page.locator('article')).toBeVisible();
  });

  test('AI companion page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/ai/');
    expect(errors).toEqual([]);
  });

  test('kanban board page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/board/');
    expect(errors).toEqual([]);
  });

  test('dashboard page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/dashboard/');
    expect(errors).toEqual([]);
  });

  test('review page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/review/');
    expect(errors).toEqual([]);
  });

  test('history page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/history/');
    expect(errors).toEqual([]);
  });

  test('trash page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/trash/');
    expect(errors).toEqual([]);
  });

  test('tags page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./docs/tags/');
    expect(errors).toEqual([]);
  });

  test('sidebar navigation links work', async ({ page }) => {
    await page.goto('./');

    // Find a sidebar link and click it
    const sidebarLinks = page.locator('.book-menu-content nav a[href]');
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThan(0);

    // Click the first visible link
    const firstLink = sidebarLinks.first();
    const href = await firstLink.getAttribute('href');
    await firstLink.click();

    // Should navigate to a new page
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('all pages have sidebar', async ({ page }) => {
    await page.goto('./docs/books/');
    await expect(page.locator('aside.book-menu')).toBeVisible();
  });

  test('all pages have theme toggle', async ({ page }) => {
    await page.goto('./docs/topics/');
    await expect(page.locator('#theme-toggle')).toBeVisible();
  });

  test('all pages have quick capture FAB', async ({ page }) => {
    await page.goto('./docs/snippets/');
    await expect(page.locator('#quick-capture-btn')).toBeVisible();
  });
});
