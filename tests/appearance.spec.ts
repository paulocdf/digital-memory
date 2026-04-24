import { test, expect } from '@playwright/test';

test.describe('Appearance / Radical Customization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    // Clean state for each test. Done after goto (rather than via addInitScript)
    // so it doesn't re-fire on page.reload() inside individual tests.
    await page.evaluate(() => {
      ['dm-theme-skin', 'dm-theme-accent', 'dm-theme-sidebar-width',
       'dm-theme-header-height', 'dm-theme-radius', 'dm-theme-background']
        .forEach(k => localStorage.removeItem(k));
      const a = (window as any).dmAppearance;
      if (a && a.reset) a.reset();
    });
  });

  test('window.dmAppearance is exposed with expected API', async ({ page }) => {
    const api = await page.evaluate(() => {
      const a = (window as any).dmAppearance;
      if (!a) return null;
      return {
        hasSetSkin: typeof a.setSkin === 'function',
        hasSetAccent: typeof a.setAccent === 'function',
        hasSetSidebarWidth: typeof a.setSidebarWidth === 'function',
        hasSetBackground: typeof a.setBackground === 'function',
        hasReset: typeof a.reset === 'function',
        skinCount: a.SKINS.length,
        accentCount: a.ACCENTS.length,
        bgCount: a.BACKGROUNDS.length
      };
    });
    expect(api).not.toBeNull();
    expect(api!.hasSetSkin).toBe(true);
    expect(api!.hasSetAccent).toBe(true);
    expect(api!.hasSetSidebarWidth).toBe(true);
    expect(api!.hasSetBackground).toBe(true);
    expect(api!.hasReset).toBe(true);
    expect(api!.skinCount).toBeGreaterThanOrEqual(6);
    expect(api!.accentCount).toBeGreaterThanOrEqual(6);
    expect(api!.bgCount).toBeGreaterThanOrEqual(5);
  });

  test('setSkin applies data-skin attribute and persists', async ({ page }) => {
    await page.evaluate(() => (window as any).dmAppearance.setSkin('terminal'));
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'terminal');
    const stored = await page.evaluate(() => localStorage.getItem('dm-theme-skin'));
    expect(stored).toBe('terminal');
  });

  test('setSkin("default") clears the data-skin attribute', async ({ page }) => {
    await page.evaluate(() => (window as any).dmAppearance.setSkin('neon'));
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'neon');
    await page.evaluate(() => (window as any).dmAppearance.setSkin('default'));
    const hasAttr = await page.locator('html').getAttribute('data-skin');
    expect(hasAttr).toBeNull();
  });

  test('setAccent sets --color-accent CSS variable and persists', async ({ page }) => {
    await page.evaluate(() => (window as any).dmAppearance.setAccent('#ff0066'));
    const accent = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--color-accent')
    );
    expect(accent).toBe('#ff0066');
    const stored = await page.evaluate(() => localStorage.getItem('dm-theme-accent'));
    expect(stored).toBe('#ff0066');
  });

  test('setSidebarWidth changes --sidebar-width and sidebar renders wider', async ({ page }) => {
    const initialWidth = await page.locator('.book-menu-content').first()
      .evaluate(el => el.getBoundingClientRect().width);

    await page.evaluate(() => (window as any).dmAppearance.setSidebarWidth('20'));
    const cssVar = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--sidebar-width')
    );
    expect(cssVar).toBe('20rem');

    // Give layout a tick to reflow
    await page.waitForTimeout(100);
    const newWidth = await page.locator('.book-menu-content').first()
      .evaluate(el => el.getBoundingClientRect().width);
    expect(newWidth).toBeGreaterThan(initialWidth);
  });

  test('setBackground applies data-bg-texture', async ({ page }) => {
    await page.evaluate(() => (window as any).dmAppearance.setBackground('dots'));
    await expect(page.locator('html')).toHaveAttribute('data-bg-texture', 'dots');
    await page.evaluate(() => (window as any).dmAppearance.setBackground('none'));
    const attr = await page.locator('html').getAttribute('data-bg-texture');
    expect(attr).toBeNull();
  });

  test('reset clears all appearance settings', async ({ page }) => {
    await page.evaluate(() => {
      const a = (window as any).dmAppearance;
      a.setSkin('warm-paper');
      a.setAccent('#112233');
      a.setBackground('paper');
      a.setSidebarWidth('18');
    });
    await page.evaluate(() => (window as any).dmAppearance.reset());

    const state = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        skin: root.getAttribute('data-skin'),
        bg: root.getAttribute('data-bg-texture'),
        accent: root.style.getPropertyValue('--color-accent'),
        ls: {
          skin: localStorage.getItem('dm-theme-skin'),
          accent: localStorage.getItem('dm-theme-accent'),
          sidebar: localStorage.getItem('dm-theme-sidebar-width'),
          bg: localStorage.getItem('dm-theme-background')
        }
      };
    });
    expect(state.skin).toBeNull();
    expect(state.bg).toBeNull();
    expect(state.accent).toBe('');
    expect(state.ls.skin).toBeNull();
    expect(state.ls.accent).toBeNull();
    expect(state.ls.sidebar).toBeNull();
    expect(state.ls.bg).toBeNull();
  });

  test('appearance settings survive reload (no FOUC)', async ({ page }) => {
    await page.evaluate(() => {
      const a = (window as any).dmAppearance;
      a.setSkin('neon');
      a.setAccent('#00ff88');
      a.setBackground('grid');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'neon');
    await expect(page.locator('html')).toHaveAttribute('data-bg-texture', 'grid');
    const accent = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--color-accent')
    );
    expect(accent).toBe('#00ff88');
  });

  test('fires dm-settings-changed event on changes', async ({ page }) => {
    const events = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const fired: string[] = [];
      document.addEventListener('dm-settings-changed', (e: any) => {
        fired.push(e.detail.key);
        if (fired.length >= 3) resolve(fired);
      });
      const a = (window as any).dmAppearance;
      a.setSkin('minimal');
      a.setAccent('#123456');
      a.setSidebarWidth('17');
    }));
    expect(events).toContain('dm-theme-skin');
    expect(events).toContain('dm-theme-accent');
    expect(events).toContain('dm-theme-sidebar-width');
  });

  test('icon sprite is accessible and contains core icons', async ({ page }) => {
    const spriteUrl = await page.evaluate(() => (window as any).DM_ICON_SPRITE as string);
    expect(spriteUrl).toBeTruthy();
    const resp = await page.request.get(spriteUrl);
    expect(resp.ok()).toBe(true);
    const text = await resp.text();
    // A handful of essential icons must be in the sprite
    ['icon-play', 'icon-pause', 'icon-x', 'icon-trash', 'icon-settings',
     'icon-calendar', 'icon-sparkles', 'icon-palette']
      .forEach(name => expect(text).toContain(`id="${name}"`));
  });

  test('dmIcon() helper returns valid SVG markup', async ({ page }) => {
    const svg = await page.evaluate(() =>
      (window as any).dmIcon('play', 24)
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('dm-icon');
    expect(svg).toContain('#icon-play');
    expect(svg).toContain('width="24"');
  });
});
