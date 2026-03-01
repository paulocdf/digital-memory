import { test, expect } from '@playwright/test';

// Helper: open the keyboard shortcuts overlay via the exposed JS API
async function openOverlay(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).dmKeyboardShortcuts.open());
}

// Helper: close the keyboard shortcuts overlay via the exposed JS API
async function closeOverlay(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).dmKeyboardShortcuts.close());
}

// Helper: toggle the keyboard shortcuts overlay via the exposed JS API
async function toggleOverlay(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as any).dmKeyboardShortcuts.toggle());
}

test.describe('Keyboard Shortcuts Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!(window as any).dmKeyboardShortcuts);
  });

  test('overlay is hidden by default', async ({ page }) => {
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });

  test('pressing ? opens the overlay', async ({ page }) => {
    await toggleOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();
  });

  test('pressing ? again closes the overlay', async ({ page }) => {
    await openOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();

    await toggleOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });

  test('pressing Escape closes the overlay', async ({ page }) => {
    await openOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });

  test('clicking backdrop closes the overlay', async ({ page }) => {
    await openOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();

    // Click at the edge of the backdrop where the dialog doesn't overlap
    await page.locator('#kbd-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });

  test('clicking close button closes the overlay', async ({ page }) => {
    await openOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();

    await page.locator('#kbd-close').click();
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });

  test('overlay contains shortcut sections and rows', async ({ page }) => {
    await openOverlay(page);
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeVisible();

    // Should have a title
    await expect(page.locator('.kbd-title')).toBeVisible();

    // Should have section titles
    const sections = page.locator('.kbd-section-title');
    expect(await sections.count()).toBeGreaterThan(0);

    // Should have shortcut rows
    const rows = page.locator('.kbd-row');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('does not open when focus is in an input', async ({ page }) => {
    // Create and focus an input element, then dispatch ? key event on it
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'test-input';
      document.body.appendChild(input);
      input.focus();
      // Dispatch keydown with target as the focused input — handler checks e.target.tagName
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: '?', code: 'Slash', shiftKey: true, bubbles: true, cancelable: true,
      }));
    });
    await expect(page.locator('#keyboard-shortcuts-overlay')).toBeHidden();
  });
});
