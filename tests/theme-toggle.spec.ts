import { test, expect } from '@playwright/test';
import { disableDemoMode } from './helpers';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Demo mode shows a top banner that intercepts pointer events on the
    // theme-toggle button. Disable it so click() can reach the toggle.
    await disableDemoMode(page);
    await page.goto('./');
  });

  test('toggle button is visible', async ({ page }) => {
    await expect(page.locator('#theme-toggle')).toBeVisible();
  });

  test('has sun and moon icons', async ({ page }) => {
    await expect(page.locator('.theme-icon--sun')).toBeAttached();
    await expect(page.locator('.theme-icon--moon')).toBeAttached();
  });

  test('clicking toggle switches theme from light to dark', async ({ page }) => {
    // Set initial state to light
    await page.evaluate(() => {
      localStorage.setItem('dm-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('clicking toggle switches theme from dark to light', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('dm-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('theme persists to localStorage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('dm-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.locator('#theme-toggle').click();
    const saved = await page.evaluate(() => localStorage.getItem('dm-theme'));
    expect(saved).toBe('dark');
  });

  test('theme persists across page reload', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('dm-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
