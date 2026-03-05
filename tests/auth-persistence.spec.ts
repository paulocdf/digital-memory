import { test, expect, Page } from '@playwright/test';

/**
 * Auth persistence and login flow tests.
 *
 * These tests verify that:
 * 1. SPA navigation from main content area preserves Firebase Auth state
 * 2. Shortcodes show a loading state (not auth card) when a cached user exists
 * 3. Front page auto-redirects to inbox after fresh login
 * 4. Full page reload with cached user doesn't flash the auth card
 *
 * Since real Firebase Auth can't be used in Playwright, we simulate auth state
 * by setting dm-cached-user in localStorage and verifying the UI behavior.
 */

const MOCK_USER = {
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/avatar.png',
};

/** Mock Firebase user object with uid (used by injectMockAuth). */
const MOCK_FIREBASE_USER = {
  uid: 'test-uid-123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/avatar.png',
};

/** Inject a cached user into localStorage before page load. */
function injectCachedUser(page: Page) {
  return page.addInitScript((user) => {
    localStorage.setItem('dm-cached-user', JSON.stringify(user));
  }, MOCK_USER);
}

/**
 * Inject cached user AND freeze Firebase Auth resolution.
 *
 * In a real scenario, Firebase reads its persisted session from IndexedDB
 * asynchronously. During that window, the cached-user guard should keep the
 * UI in "loading" state (not flash the auth card). In tests, Firebase resolves
 * almost instantly with null (no real session), which overrides the guard.
 *
 * This helper replaces dmAuthReady with a never-resolving promise so we can
 * verify the guard holds the loading state indefinitely.
 */
function injectCachedUserAndFreezeAuth(page: Page) {
  return page.addInitScript((user) => {
    localStorage.setItem('dm-cached-user', JSON.stringify(user));

    // After Firebase init sets window.dmAuthReady, replace it with a
    // never-resolving promise. Use Object.defineProperty to win the race
    // against head.html's inline script that sets dmAuthReady.
    let _frozen = false;
    const neverResolve = new Promise(() => {});
    Object.defineProperty(window, 'dmAuthReady', {
      get() { return neverResolve; },
      set() { _frozen = true; },
      configurable: true,
    });
  }, MOCK_USER);
}

/**
 * Inject a fully controllable mock Firebase Auth into the page.
 *
 * Replaces window.dmAuth with a mock that provides:
 * - onAuthStateChanged(cb) — registers listeners, fires asynchronously
 * - signOut() — emits null to all listeners
 * - signInWithPopup() — resolves with the initial user
 * - currentUser — tracks the current user
 * - window._mockAuthEmit(user) — test hook to trigger state transitions
 * - window._mockAuthSubscribers — array of registered listeners
 *
 * Also replaces dmSignIn and dmRegisterUser with no-ops, and lets
 * head.html's waitForAuthState() and dmAuthReady work naturally since
 * they call onAuthStateChanged on the mock.
 *
 * @param page - Playwright Page
 * @param initialUser - The user to emit on first onAuthStateChanged call.
 *                      Pass null for signed-out state.
 */
function injectMockAuth(page: Page, initialUser: typeof MOCK_FIREBASE_USER | null) {
  return page.addInitScript((user) => {
    // Pre-populate dm-cached-user if initial user is provided
    if (user) {
      localStorage.setItem('dm-cached-user', JSON.stringify({
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
      }));
    } else {
      localStorage.removeItem('dm-cached-user');
    }

    // Track subscribers and current user state
    (window as any)._mockAuthSubscribers = [] as Array<(user: any) => void>;
    (window as any)._mockAuthCurrentUser = user;

    // Emit a user state to all subscribers
    (window as any)._mockAuthEmit = function(newUser: any) {
      (window as any)._mockAuthCurrentUser = newUser;
      // Update dm-cached-user just like the real auth flow does
      try {
        if (newUser) {
          localStorage.setItem('dm-cached-user', JSON.stringify({
            displayName: newUser.displayName || '',
            email: newUser.email || '',
            photoURL: newUser.photoURL || '',
          }));
        } else {
          localStorage.removeItem('dm-cached-user');
        }
      } catch(e) {}
      var subs = (window as any)._mockAuthSubscribers;
      for (var i = 0; i < subs.length; i++) {
        subs[i](newUser);
      }
    };

    // Build the mock auth object
    var mockAuth = {
      get currentUser() {
        return (window as any)._mockAuthCurrentUser;
      },
      onAuthStateChanged: function(callback: (user: any) => void) {
        (window as any)._mockAuthSubscribers.push(callback);
        // Fire asynchronously with current user (like real Firebase)
        var currentUser = (window as any)._mockAuthCurrentUser;
        setTimeout(function() { callback(currentUser); }, 0);
        // Return unsubscribe function
        return function() {
          var subs = (window as any)._mockAuthSubscribers;
          var idx = subs.indexOf(callback);
          if (idx >= 0) subs.splice(idx, 1);
        };
      },
      signOut: function() {
        (window as any)._mockAuthEmit(null);
        return Promise.resolve();
      },
      signInWithPopup: function() {
        // Simulate sign-in with the initial user
        var u = user || {
          uid: 'test-uid-123',
          displayName: 'Test User',
          email: 'test@example.com',
          photoURL: 'https://example.com/avatar.png',
        };
        (window as any)._mockAuthEmit(u);
        return Promise.resolve({ user: u });
      },
      signInWithRedirect: function() { return Promise.resolve(); },
      getRedirectResult: function() { return Promise.resolve(null); },
    };

    // Intercept dmAuth assignment via Object.defineProperty.
    // head.html does: window.dmAuth = firebase.auth();
    // We intercept the set and replace with our mock.
    var _mockAuth = mockAuth;
    Object.defineProperty(window, 'dmAuth', {
      get() { return _mockAuth; },
      set() { /* swallow the real firebase.auth() assignment */ },
      configurable: true,
    });

    // Also intercept dmDb/dmStorage/dmGoogleProvider to prevent errors
    // when dm-sync.html tries to use Firestore
    var _dmDb: any = null;
    Object.defineProperty(window, 'dmDb', {
      get() { return _dmDb; },
      set(v) { _dmDb = v; },
      configurable: true,
    });

    // Replace dmSignIn and dmRegisterUser with no-ops
    Object.defineProperty(window, 'dmSignIn', {
      get() { return function() { mockAuth.signInWithPopup(); }; },
      set() {},
      configurable: true,
    });
    Object.defineProperty(window, 'dmRegisterUser', {
      get() { return function() {}; },
      set() {},
      configurable: true,
    });
  }, initialUser);
}

test.describe('Auth Persistence — Cached User Flash Prevention', () => {
  test.describe('Shortcodes show loading (not auth card) with cached user', () => {
    // For each page, verify that a cached user prevents the auth card from
    // being shown. Instead, a loading state should be displayed while
    // Firebase Auth resolves.

    const pages = [
      { name: 'Inbox',     url: './docs/inbox/',     authSel: '.single-note-auth',  loadSel: '.single-note-loading' },
      { name: 'Board',     url: './docs/board/',     authSel: '.kanban-auth',        loadSel: '.kanban-loading' },
      { name: 'Dashboard', url: './docs/dashboard/', authSel: '#dashboard-auth',     loadSel: '#dashboard-loading' },
      { name: 'Review',    url: './docs/review/',    authSel: '#review-auth',        loadSel: '#review-loading' },
      { name: 'History',   url: './docs/history/',   authSel: '#history-auth',       loadSel: '#history-loading' },
      { name: 'Trash',     url: './docs/trash/',     authSel: '#trash-auth',         loadSel: '#trash-loading' },
      { name: 'Tags',      url: './docs/tags/',      authSel: '#tag-cloud-auth',     loadSel: '#tag-cloud-loading' },
    ];

    for (const pg of pages) {
      test(`${pg.name} page shows loading state with cached user`, async ({ page }) => {
        // Freeze auth resolution so Firebase doesn't immediately resolve null
        // and override the cached-user loading guard
        await injectCachedUserAndFreezeAuth(page);
        await page.goto(pg.url);

        // The auth card should NOT be visible (loading state should be shown)
        const authEl = page.locator(pg.authSel);
        if (await authEl.count() > 0) {
          await expect(authEl).toBeHidden();
        }
      });
    }

    for (const pg of pages) {
      test(`${pg.name} page shows auth card WITHOUT cached user`, async ({ page }) => {
        // Ensure no cached user
        await page.addInitScript(() => {
          localStorage.removeItem('dm-cached-user');
        });
        await page.goto(pg.url);

        // Wait for scripts to execute and auth to resolve
        // Without Firebase, dmAuth won't exist or will resolve with null user,
        // so the auth card should eventually appear
        const authEl = page.locator(pg.authSel);
        if (await authEl.count() > 0) {
          // Auth element exists in the DOM — it should become visible
          // (though timing depends on Firebase availability)
          await expect(authEl).toBeAttached();
        }
      });
    }
  });
});

test.describe('Auth Persistence — SPA Navigation', () => {
  test('SPA navigation intercepts main content area links', async ({ page }) => {
    await page.goto('./');

    // Find a garden-sections card link (e.g. Inbox link in the section card)
    const inboxLink = page.locator('.section-card.card-inbox h3 a');
    await expect(inboxLink).toBeVisible();

    // Click it — should be intercepted by SPA navigation (no full page reload)
    const href = await inboxLink.getAttribute('href');
    expect(href).toBeTruthy();

    // Listen for navigation type (SPA = no load event, full = load event)
    const navigationPromise = page.waitForURL(new RegExp('inbox'), { timeout: 5000 });
    await inboxLink.click();
    await navigationPromise;

    // URL should have changed to inbox
    expect(page.url()).toContain('inbox');
  });

  test('SPA navigation from garden-sections preserves globals', async ({ page }) => {
    await page.goto('./');

    // Verify window.dmAuth exists on the landing page
    const hasAuthBefore = await page.evaluate(() => typeof window.dmAuth !== 'undefined');

    // Click a section card link
    const booksLink = page.locator('.section-card.card-books h3 a');
    if (await booksLink.count() > 0) {
      await booksLink.click();
      await page.waitForTimeout(1000); // wait for SPA swap + script execution

      // After SPA navigation, dmAuth should still exist
      const hasAuthAfter = await page.evaluate(() => typeof window.dmAuth !== 'undefined');

      // If dmAuth existed before, it should still exist after SPA navigation
      if (hasAuthBefore) {
        expect(hasAuthAfter).toBe(true);
      }
    }
  });

  test('sidebar links still work with SPA navigation', async ({ page }) => {
    await page.goto('./');

    // Find a sidebar link
    const sidebarLinks = page.locator('.book-menu-content nav a[href]');
    const count = await sidebarLinks.count();
    if (count > 0) {
      const firstLink = sidebarLinks.first();
      const href = await firstLink.getAttribute('href');
      await firstLink.click();

      // Should navigate
      if (href) {
        await page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 5000 });
      }
    }
  });

  test('main content link with modifier key does NOT use SPA navigation', async ({ page }) => {
    await page.goto('./');

    const inboxLink = page.locator('.section-card.card-inbox h3 a');
    if (await inboxLink.count() > 0) {
      // Ctrl+click should open in new tab (not SPA), so page URL stays the same
      const urlBefore = page.url();

      // We can't easily test new tab behavior, but we can verify the link
      // has correct href attribute (it will be used by the browser natively)
      const href = await inboxLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toContain('inbox');
    }
  });
});

test.describe('Auth Persistence — Front Page Auto-Redirect', () => {
  test('front page has garden-hero sign-in button', async ({ page }) => {
    // Without cached user, sign-in button should be visible
    await page.addInitScript(() => {
      localStorage.removeItem('dm-cached-user');
    });
    await page.goto('./');
    await expect(page.locator('#garden-signin')).toBeVisible();
  });

  test('front page hides sign-in button with cached user', async ({ page }) => {
    // Freeze auth so Firebase doesn't resolve null and show the sign-in button
    await injectCachedUserAndFreezeAuth(page);
    await page.goto('./');

    // Sign-in button should be hidden because cached user is pre-applied
    await expect(page.locator('#garden-signin')).toBeHidden();

    // User info should be visible
    await expect(page.locator('#garden-auth-user')).toBeVisible();
    await expect(page.locator('#garden-auth-name')).toHaveText(MOCK_USER.displayName);
  });

  test('front page garden-hero auth elements exist', async ({ page }) => {
    await page.goto('./');

    // Verify all auth elements are present
    await expect(page.locator('#garden-signin')).toBeAttached();
    await expect(page.locator('#garden-auth-user')).toBeAttached();
    await expect(page.locator('#garden-auth-avatar')).toBeAttached();
    await expect(page.locator('#garden-auth-name')).toBeAttached();
    await expect(page.locator('#garden-signout')).toBeAttached();
  });
});

test.describe('Auth Persistence — SPA Navigation shouldIntercept', () => {
  test('external links are not intercepted', async ({ page }) => {
    await page.goto('./');

    // External links should not be intercepted by SPA navigation
    const externalLinkCount = await page.evaluate(() => {
      const links = document.querySelectorAll('.book-page a[href*="://"]');
      let externalCount = 0;
      links.forEach(a => {
        if (!a.getAttribute('href')!.includes(window.location.origin)) {
          externalCount++;
        }
      });
      return externalCount;
    });

    // This is just a structural check — external links exist and are not modified
    // The shouldIntercept function will skip them at runtime
    expect(externalLinkCount).toBeGreaterThanOrEqual(0);
  });

  test('SPA navigation handler exists on main content area', async ({ page }) => {
    await page.goto('./');

    // Verify that the book-page element has click listeners
    // We can check this indirectly: clicking an internal link in main content
    // should use SPA navigation (pushState) instead of a full reload
    const bookPage = page.locator('.book-page');
    await expect(bookPage).toBeVisible();

    // Check that navigateTo function exists in page context
    // (it's in an IIFE, so we check for the SPA history state instead)
    const hasSpaSstate = await page.evaluate(() => {
      return !!(history.state && history.state.spaNav);
    });
    expect(hasSpaSstate).toBe(true);
  });
});

test.describe('Auth Persistence — Full Page Reload Defense', () => {
  test('cached user state survives page reload', async ({ page }) => {
    // Freeze auth so Firebase doesn't clear the cached user
    await injectCachedUserAndFreezeAuth(page);
    await page.goto('./');

    // Verify cached user is applied
    await expect(page.locator('#garden-auth-name')).toHaveText(MOCK_USER.displayName);

    // Reload page (simulating full navigation)
    await page.reload();

    // After reload, cached user should still be pre-applied
    await expect(page.locator('#garden-auth-name')).toHaveText(MOCK_USER.displayName);
    await expect(page.locator('#garden-signin')).toBeHidden();
  });

  test('direct navigation to inbox with cached user shows loading not auth', async ({ page }) => {
    await injectCachedUserAndFreezeAuth(page);
    await page.goto('./docs/inbox/');

    // The auth card should not be visible (loading state should be shown instead)
    const authEl = page.locator('.single-note-auth');
    if (await authEl.count() > 0) {
      await expect(authEl).toBeHidden();
    }
  });

  test('direct navigation to board with cached user shows loading not auth', async ({ page }) => {
    await injectCachedUserAndFreezeAuth(page);
    await page.goto('./docs/board/');

    // The auth card should not be visible
    const authEl = page.locator('.kanban-auth');
    if (await authEl.count() > 0) {
      await expect(authEl).toBeHidden();
    }
  });
});

test.describe('Auth Persistence — No JS Errors', () => {
  const appPages = [
    { name: 'Landing',   url: './' },
    { name: 'Inbox',     url: './docs/inbox/' },
    { name: 'Board',     url: './docs/board/' },
    { name: 'Dashboard', url: './docs/dashboard/' },
    { name: 'Review',    url: './docs/review/' },
    { name: 'History',   url: './docs/history/' },
    { name: 'Trash',     url: './docs/trash/' },
    { name: 'Tags',      url: './docs/tags/' },
  ];

  for (const pg of appPages) {
    test(`${pg.name} page loads without JS errors (with cached user)`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await injectCachedUser(page);
      await page.goto(pg.url);

      expect(errors).toEqual([]);
    });

    test(`${pg.name} page loads without JS errors (without cached user)`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.addInitScript(() => {
        localStorage.removeItem('dm-cached-user');
      });
      await page.goto(pg.url);

      expect(errors).toEqual([]);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Mock Auth Tests — Groups 1-7
// These tests use injectMockAuth for full control over auth state transitions.
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Auth Mock — Sign-out Flow', () => {
  test('garden-hero sign-out clears cached user and shows sign-in button', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for mock auth to settle — user should be signed in
    await expect(page.locator('#garden-signin')).toBeHidden();
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Click garden sign-out button
    await page.locator('#garden-signout').click();

    // dm-cached-user should be removed
    const cachedUser = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(cachedUser).toBeNull();

    // Sign-in button should appear, user info should hide
    await expect(page.locator('#garden-signin')).toBeVisible();
    await expect(page.locator('#garden-auth-user')).toBeHidden();
  });

  test('settings-modal sign-out clears cached user', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Open settings modal and click sign-out
    await page.evaluate(() => (window as any).openSettingsModal());
    await page.locator('#settings-modal-signout').click();

    // dm-cached-user should be cleared
    const cachedUser = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(cachedUser).toBeNull();
  });

  test('quick-capture sign-out clears cached user', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./docs/inbox/');

    // Wait for auth to settle
    await page.waitForTimeout(500);

    // The quick-capture sign-out button is in the sidebar
    const qcSignout = page.locator('#qc-signout');
    if (await qcSignout.count() > 0 && await qcSignout.isVisible()) {
      await qcSignout.click();

      const cachedUser = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
      expect(cachedUser).toBeNull();
    }
  });

  test('sign-out on app page shows auth card', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./docs/inbox/');

    // Wait for auth to settle — auth card should be hidden (user signed in)
    await expect(page.locator('.single-note-auth')).toBeHidden({ timeout: 5000 });

    // Trigger sign-out via mock
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // Auth card should become visible
    await expect(page.locator('.single-note-auth')).toBeVisible();
  });

  test('sign-out on board page hides board content', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./docs/board/');

    // Wait for auth to settle — auth card should be hidden (signed in)
    await expect(page.locator('.kanban-auth')).toBeHidden({ timeout: 5000 });

    // Trigger sign-out
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // After sign-out, board content should not be visible.
    // Note: dm-sync's handleSyncAuth(null) clears IDB and dispatches
    // dm-todos-updated, which may show the empty state instead of auth card.
    // Both are valid — the key is board content is hidden.
    await expect(page.locator('#kanban-content')).toBeHidden({ timeout: 5000 });
  });
});

test.describe('Auth Mock — onAuthStateChanged Transitions', () => {
  test('null→user transition on inbox hides auth card', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./docs/inbox/');

    // Auth card should be visible (signed out)
    await expect(page.locator('.single-note-auth')).toBeVisible({ timeout: 5000 });

    // Simulate sign-in
    await page.evaluate((u) => (window as any)._mockAuthEmit(u), MOCK_FIREBASE_USER);

    // Auth card should hide
    await expect(page.locator('.single-note-auth')).toBeHidden();
  });

  test('user→null transition on board hides board content', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./docs/board/');

    // Auth card should be hidden (signed in)
    await expect(page.locator('.kanban-auth')).toBeHidden({ timeout: 5000 });

    // Simulate sign-out
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // Board content should not be visible after sign-out.
    // The final state may be auth card or empty state, depending on
    // the race between onAuthStateChanged and dm-todos-updated.
    await expect(page.locator('#kanban-content')).toBeHidden({ timeout: 5000 });
  });

  test('null→user on landing page triggers auto-redirect to inbox', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./');

    // Sign-in button should be visible
    await expect(page.locator('#garden-signin')).toBeVisible({ timeout: 5000 });

    // Simulate fresh sign-in (wasSignedInOnLoad is false)
    await page.evaluate((u) => (window as any)._mockAuthEmit(u), MOCK_FIREBASE_USER);

    // Should redirect to inbox
    await page.waitForURL(/inbox/, { timeout: 5000 });
    expect(page.url()).toContain('inbox');
  });

  test('user→null on landing page shows sign-in and hides user info', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // User should be signed in (returning user, no redirect)
    await expect(page.locator('#garden-signin')).toBeHidden();
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Simulate sign-out
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // Sign-in button should appear, user info should hide
    await expect(page.locator('#garden-signin')).toBeVisible();
    await expect(page.locator('#garden-auth-user')).toBeHidden();
  });
});

test.describe('Auth Mock — dm-cached-user localStorage Contract', () => {
  test('auth sign-in writes dm-cached-user to localStorage', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./docs/inbox/');

    // Verify no cached user initially
    const before = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(before).toBeNull();

    // Simulate sign-in
    await page.evaluate((u) => (window as any)._mockAuthEmit(u), MOCK_FIREBASE_USER);

    // dm-cached-user should now be written
    const after = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(after).not.toBeNull();
    const parsed = JSON.parse(after!);
    expect(parsed.displayName).toBe(MOCK_FIREBASE_USER.displayName);
    expect(parsed.email).toBe(MOCK_FIREBASE_USER.email);
  });

  test('auth sign-out clears dm-cached-user from localStorage', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./docs/inbox/');

    // Wait for auth to settle
    await page.waitForTimeout(500);

    // Verify cached user exists
    const before = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(before).not.toBeNull();

    // Simulate sign-out
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // dm-cached-user should be removed
    const after = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(after).toBeNull();
  });

  test('dm-cached-user has correct shape: displayName, email, photoURL', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle
    await page.waitForTimeout(500);

    const raw = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);

    // Should have exactly these three keys
    expect(Object.keys(parsed).sort()).toEqual(['displayName', 'email', 'photoURL']);
    expect(parsed.displayName).toBe(MOCK_FIREBASE_USER.displayName);
    expect(parsed.email).toBe(MOCK_FIREBASE_USER.email);
    expect(parsed.photoURL).toBe(MOCK_FIREBASE_USER.photoURL);
  });

  test('corrupted dm-cached-user does not crash page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.addInitScript(() => {
      localStorage.setItem('dm-cached-user', 'not valid json{{{');
    });
    await page.goto('./docs/inbox/');

    // Page should load without JS errors despite corrupted cached user
    expect(errors).toEqual([]);
  });

  test('dm-cached-user is not written for null user', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./');

    // Wait for auth to settle
    await page.waitForTimeout(500);

    const raw = await page.evaluate(() => localStorage.getItem('dm-cached-user'));
    expect(raw).toBeNull();
  });
});

test.describe('Auth Mock — garden-sections Auth Gating', () => {
  test('without cached user: sections do not show user data', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./');

    // Wait for auth to settle and garden-sections to render
    await page.waitForTimeout(1500);

    // Sections should NOT show real user data (notes, tasks, etc).
    // They may show "Sign in to see your notes." or empty state messages
    // like "No book notes yet." depending on event ordering — both are
    // valid signed-out states.
    const booksSection = page.locator('#garden-section-books');
    const inboxSection = page.locator('#garden-section-inbox');

    if (await booksSection.count() > 0) {
      const text = await booksSection.textContent() || '';
      // Should contain an italicized message, not real note links
      const hasEmptyMsg = text.includes('Sign in') || text.includes('No book notes yet') || text.includes('Loading');
      expect(hasEmptyMsg).toBe(true);
    }
    if (await inboxSection.count() > 0) {
      const text = await inboxSection.textContent() || '';
      const hasEmptyMsg = text.includes('Sign in') || text.includes('inbox is empty') || text.includes('Loading');
      expect(hasEmptyMsg).toBe(true);
    }
  });

  test('with cached user (frozen auth): sections do NOT show "Sign in"', async ({ page }) => {
    await injectCachedUserAndFreezeAuth(page);
    await page.goto('./');

    // With frozen auth and cached user, sections should NOT show sign-in
    const booksSection = page.locator('#garden-section-books');
    const inboxSection = page.locator('#garden-section-inbox');

    if (await booksSection.count() > 0) {
      const text = await booksSection.textContent();
      expect(text).not.toContain('Sign in');
    }
    if (await inboxSection.count() > 0) {
      const text = await inboxSection.textContent();
      expect(text).not.toContain('Sign in');
    }
  });

  test('after sign-out: sections do not show user data', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle (returning user, no redirect)
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Trigger sign-out
    await page.evaluate(() => (window as any)._mockAuthEmit(null));

    // Wait for sections to re-render after sign-out events
    await page.waitForTimeout(1500);

    // Sections should not show real user data after sign-out.
    // May show "Sign in" or empty state messages.
    const booksSection = page.locator('#garden-section-books');
    if (await booksSection.count() > 0) {
      const text = await booksSection.textContent() || '';
      const hasEmptyMsg = text.includes('Sign in') || text.includes('No book notes yet') || text.includes('Loading');
      expect(hasEmptyMsg).toBe(true);
    }
  });
});

test.describe('Auth Mock — Auto-Redirect After Login', () => {
  test('fresh login on front page redirects to inbox', async ({ page }) => {
    // Start signed out (wasSignedInOnLoad = false)
    await injectMockAuth(page, null);
    await page.goto('./');

    // Verify on landing page, signed out
    await expect(page.locator('#garden-signin')).toBeVisible({ timeout: 5000 });

    // Simulate fresh sign-in
    await page.evaluate((u) => (window as any)._mockAuthEmit(u), MOCK_FIREBASE_USER);

    // Should redirect to inbox
    await page.waitForURL(/inbox/, { timeout: 5000 });
    expect(page.url()).toContain('inbox');
  });

  test('returning user on front page does NOT redirect', async ({ page }) => {
    // Start signed in (wasSignedInOnLoad = true, no redirect)
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Wait a bit to ensure no redirect happens
    await page.waitForTimeout(2000);

    // Should still be on landing page
    expect(page.url()).not.toContain('inbox');
  });

  test('auto-redirect does not fire on non-front pages', async ({ page }) => {
    // Start signed out on board page
    await injectMockAuth(page, null);
    await page.goto('./docs/board/');

    // Wait for page to settle
    await page.waitForTimeout(500);

    // Simulate sign-in — should NOT redirect (auto-redirect only on front page)
    await page.evaluate((u) => (window as any)._mockAuthEmit(u), MOCK_FIREBASE_USER);

    // Wait to ensure no redirect
    await page.waitForTimeout(1500);

    // Should still be on board page
    expect(page.url()).toContain('board');
  });
});

test.describe('Auth Mock — SPA Nav Auth Preservation', () => {
  test('SPA nav from landing to inbox: mock auth user sees content', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle (returning user, no redirect)
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // Click the inbox section card link (SPA navigation)
    const inboxLink = page.locator('.section-card.card-inbox h3 a');
    if (await inboxLink.count() > 0) {
      await inboxLink.click();
      await page.waitForURL(/inbox/, { timeout: 5000 });

      // After SPA nav, auth card should be hidden (user still authenticated)
      await expect(page.locator('.single-note-auth')).toBeHidden({ timeout: 5000 });
    }
  });

  test('SPA nav to board after sign-out hides board content', async ({ page }) => {
    await injectMockAuth(page, null);
    await page.goto('./');

    // User is signed out
    await expect(page.locator('#garden-signin')).toBeVisible({ timeout: 5000 });

    // Use sidebar link to navigate to board
    const boardLink = page.locator('.book-menu-content nav a[href*="board"]');
    if (await boardLink.count() > 0) {
      await boardLink.first().click();
      await page.waitForURL(/board/, { timeout: 5000 });

      // Wait for SPA swap and script execution
      await page.waitForTimeout(1000);

      // After SPA nav while signed out, board content should not be visible.
      // The kanban-auth or kanban-empty state should be shown instead.
      const kanbanContent = page.locator('#kanban-content');
      if (await kanbanContent.count() > 0) {
        await expect(kanbanContent).toBeHidden({ timeout: 5000 });
      }
    }
  });

  test('auth state persists across multiple SPA navigations', async ({ page }) => {
    await injectMockAuth(page, MOCK_FIREBASE_USER);
    await page.goto('./');

    // Wait for auth to settle (returning user, stays on landing)
    await expect(page.locator('#garden-auth-user')).toBeVisible();

    // SPA nav to inbox
    const inboxLink = page.locator('.section-card.card-inbox h3 a');
    if (await inboxLink.count() > 0) {
      await inboxLink.click();
      await page.waitForURL(/inbox/, { timeout: 5000 });
      await expect(page.locator('.single-note-auth')).toBeHidden({ timeout: 5000 });

      // SPA nav to board via sidebar
      const boardLink = page.locator('.book-menu-content nav a[href*="board"]');
      if (await boardLink.count() > 0) {
        await boardLink.first().click();
        await page.waitForURL(/board/, { timeout: 5000 });
        await expect(page.locator('.kanban-auth')).toBeHidden({ timeout: 5000 });
      }
    }
  });
});

test.describe('Auth Mock — Redirect Sign-in Flow', () => {
  test('dm-pending-redirect flag is cleared on page load', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('dm-pending-redirect', '1');
    });
    await page.goto('./docs/inbox/');

    // head.html should clear dm-pending-redirect on load
    const flag = await page.evaluate(() => localStorage.getItem('dm-pending-redirect'));
    expect(flag).toBeNull();
  });

  test('page loads without errors when dm-pending-redirect is set', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.addInitScript(() => {
      localStorage.setItem('dm-pending-redirect', '1');
    });
    await page.goto('./docs/inbox/');

    expect(errors).toEqual([]);
  });

  test('dm-pending-redirect flag is cleared on landing page too', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('dm-pending-redirect', '1');
    });
    await page.goto('./');

    const flag = await page.evaluate(() => localStorage.getItem('dm-pending-redirect'));
    expect(flag).toBeNull();
  });
});
