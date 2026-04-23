import { test, expect } from '@playwright/test';
import { MOCK_USER, injectMockAuth, waitForDmSync } from './helpers';

/**
 * Settings modal tests.
 *
 * The settings panel lives in body.html and is rendered into the sidebar
 * after auth resolves. We inject a mock auth user so the panel initialises
 * without needing real Firebase credentials.
 *
 * The panel reads/writes only localStorage, so no IDB seeding is needed.
 */

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./');
    await waitForDmSync(page);

    // Wait for the settings toggle to appear (rendered after auth resolves)
    await page.waitForSelector('#sidebar-settings-toggle', { timeout: 10_000 });
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

    // Click a corner of the backdrop to avoid the dialog covering the center
    await page.locator('.settings-modal-backdrop').click({ position: { x: 5, y: 5 } });
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

    // The checkbox has width:0/height:0 (CSS toggle switch pattern).
    // Click the wrapping label instead so the change event fires.
    const autoBreak = page.locator('#setting-auto-break');
    const initialState = await autoBreak.isChecked();
    await page.locator('label.settings-modal-toggle-switch').filter({ has: page.locator('#setting-auto-break') }).click();

    const saved = await page.evaluate(() => localStorage.getItem('dm-pomo-auto-break'));
    expect(saved).toBe(initialState ? 'false' : 'true');
  });

  test('has AI companion toggle', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    await expect(page.locator('#setting-ai-enabled')).toBeAttached();
  });

  test('Escape key closes the modal', async ({ page }) => {
    await page.evaluate(() => (window as any).openSettingsModal());
    await expect(page.locator('.settings-modal-overlay')).toHaveClass(/settings-modal-visible/);

    // The Escape keydown listener is on the overlay element (not document).
    // Dispatch the event directly on it because the overlay has no tabindex.
    await page.evaluate(() => {
      const overlay = document.querySelector('.settings-modal-overlay')!;
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.settings-modal-overlay')).not.toHaveClass(/settings-modal-visible/);
  });
});
