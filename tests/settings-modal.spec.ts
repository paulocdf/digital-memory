import { test, expect } from '@playwright/test';

// The settings modal is created dynamically by JavaScript after Firebase authentication.
// Without auth, neither the #sidebar-settings-toggle trigger nor the .settings-modal-overlay
// exist in the DOM. These tests are skipped when running without authentication.

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    // Check if the settings modal infrastructure exists (requires auth to initialize)
    const hasSettings = await page.evaluate(() =>
      typeof (window as any).openSettingsModal === 'function' &&
      !!document.querySelector('.settings-modal-overlay')
    );
    test.skip(!hasSettings, 'Settings modal requires authentication to initialize');
  });

  test('settings trigger is visible in sidebar', async ({ page }) => {
    await expect(page.locator('#sidebar-settings-toggle')).toBeVisible();
  });

  test('clicking settings trigger opens modal', async ({ page }) => {
    await page.locator('#sidebar-settings-toggle').click();
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);
  });

  test('modal has header with title and close button', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-title')).toBeVisible();
    await expect(page.locator('.settings-modal-close')).toBeVisible();
  });

  test('close button closes modal', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await page.locator('.settings-modal-close').click();
    await expect(page.locator('.settings-modal-overlay')).not.toHaveClass(/settings-modal-visible/);
  });

  test('clicking backdrop closes modal', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await page.locator('.settings-modal-backdrop').click();
    await expect(page.locator('.settings-modal-overlay')).not.toHaveClass(/settings-modal-visible/);
  });

  test('has pomodoro duration settings', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-pomo-short-work')).toBeVisible();
    await expect(page.locator('#setting-pomo-short-break')).toBeVisible();
    await expect(page.locator('#setting-pomo-long-work')).toBeVisible();
    await expect(page.locator('#setting-pomo-long-break')).toBeVisible();
  });

  test('has automation toggles', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-auto-schedule')).toBeAttached();
    await expect(page.locator('#setting-auto-break')).toBeAttached();
    await expect(page.locator('#setting-auto-work')).toBeAttached();
  });

  test('has sound settings', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-sound-work')).toBeVisible();
    await expect(page.locator('#setting-sound-break')).toBeVisible();
    await expect(page.locator('#setting-sound-volume')).toBeVisible();
  });

  test('has default pomo count setting', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-pomo-count')).toBeVisible();
  });

  test('changing pomodoro duration persists to localStorage', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    // Change short work duration
    await page.locator('#setting-pomo-short-work').fill('30');
    await page.locator('#setting-pomo-short-work').dispatchEvent('change');

    const saved = await page.evaluate(() => localStorage.getItem('dm-pomo-short-work'));
    expect(saved).toBe('30');
  });

  test('toggling auto-break persists to localStorage', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    const autoBreak = page.locator('#setting-auto-break');
    const initialState = await autoBreak.isChecked();
    await autoBreak.click();

    const saved = await page.evaluate(() => localStorage.getItem('dm-pomo-auto-break'));
    expect(saved).toBe(initialState ? 'false' : 'true');
  });

  test('has AI companion toggle', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-ai-enabled')).toBeAttached();
  });
});
