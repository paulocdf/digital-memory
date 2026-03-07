import { test, expect, Page } from '@playwright/test';

/**
 * Auth login flow tests.
 *
 * These tests verify the browser-specific sign-in strategies:
 * 1. Firefox uses signInWithPopup (GIS prompt blocked by ETP)
 * 2. Desktop Chrome uses GIS prompt() with FedCM
 * 3. Mobile browsers use eager GIS init + auto_select for redirect-return flow
 * 4. Sign-out sets dm-gis-signed-out flag, sign-in clears it
 * 5. GIS prompt fallback to signInWithPopup when prompt() fails
 *
 * Since real GIS/Firebase Auth can't be used in Playwright, we inject mock
 * GIS and Firebase objects and verify the correct code paths are invoked
 * by tracking function calls.
 */

const MOCK_FIREBASE_USER = {
  uid: 'test-uid-123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/avatar.png',
};

/**
 * Inject mock Firebase Auth + mock GIS into the page.
 *
 * Sets up:
 * - window.dmAuth mock with signInWithPopup, signInWithCredential, signOut
 * - window._authCalls array tracking which methods were called
 * - window._gisCalls array tracking GIS initialize/prompt calls
 * - Mock google.accounts.id with configurable prompt behavior
 *
 * @param promptBehavior - How the mock GIS prompt() should behave:
 *   'success' — calls the moment listener with isDismissedMoment()
 *   'not_displayed' — calls the moment listener with isNotDisplayed()
 *   'silent' — never calls the moment listener (simulates GIS fully blocked)
 */
function injectMockAuthAndGis(
  page: Page,
  options: {
    promptBehavior?: 'success' | 'not_displayed' | 'skipped' | 'silent';
    isMobile?: boolean;
    isFirefox?: boolean;
  } = {}
) {
  const { promptBehavior = 'success', isMobile = false, isFirefox = false } = options;
  return page.addInitScript(({ user, promptBehavior, isMobile, isFirefox }) => {
    // Track all auth/GIS calls for assertions
    (window as any)._authCalls = [] as string[];
    (window as any)._gisCalls = [] as string[];
    (window as any)._gisInitArgs = null as any;

    // Override mobile detection
    Object.defineProperty(window, 'dmIsMobile', {
      get() { return isMobile; },
      set() {},
      configurable: true,
    });

    // Override Firefox detection by setting the internal var.
    // head.html reads navigator.userAgent at script evaluation time,
    // so we must override at the UA level for the detection to work.
    if (isFirefox) {
      Object.defineProperty(navigator, 'userAgent', {
        get() { return 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'; },
        configurable: true,
      });
    }

    // Mock Firebase Auth subscribers
    (window as any)._mockAuthSubscribers = [] as Array<(u: any) => void>;
    (window as any)._mockAuthCurrentUser = null;
    (window as any)._mockAuthEmit = function(newUser: any) {
      (window as any)._mockAuthCurrentUser = newUser;
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
      for (var i = 0; i < subs.length; i++) subs[i](newUser);
    };

    var mockAuth = {
      get currentUser() { return (window as any)._mockAuthCurrentUser; },
      onAuthStateChanged: function(callback: (u: any) => void) {
        (window as any)._mockAuthSubscribers.push(callback);
        var cur = (window as any)._mockAuthCurrentUser;
        setTimeout(function() { callback(cur); }, 0);
        return function() {
          var subs = (window as any)._mockAuthSubscribers;
          var idx = subs.indexOf(callback);
          if (idx >= 0) subs.splice(idx, 1);
        };
      },
      signOut: function() {
        (window as any)._authCalls.push('signOut');
        (window as any)._mockAuthEmit(null);
        return Promise.resolve();
      },
      signInWithCredential: function() {
        (window as any)._authCalls.push('signInWithCredential');
        (window as any)._mockAuthEmit(user);
        return Promise.resolve({ user: user });
      },
      signInWithPopup: function() {
        (window as any)._authCalls.push('signInWithPopup');
        (window as any)._mockAuthEmit(user);
        return Promise.resolve({ user: user });
      },
      signInWithRedirect: function() { return Promise.resolve(); },
      getRedirectResult: function() { return Promise.resolve(null); },
    };

    Object.defineProperty(window, 'dmAuth', {
      get() { return mockAuth; },
      set() {},
      configurable: true,
    });

    // Mock dmGoogleProvider
    Object.defineProperty(window, 'dmGoogleProvider', {
      get() { return { providerId: 'google.com' }; },
      set() {},
      configurable: true,
    });

    // Mock dmDb to prevent Firestore errors
    var _dmDb: any = null;
    Object.defineProperty(window, 'dmDb', {
      get() { return _dmDb; },
      set(v) { _dmDb = v; },
      configurable: true,
    });

    // Mock dmRegisterUser
    Object.defineProperty(window, 'dmRegisterUser', {
      get() { return function() {}; },
      set() {},
      configurable: true,
    });

    // Mock GIS (google.accounts.id)
    var mockGis = {
      initialize: function(args: any) {
        (window as any)._gisCalls.push('initialize');
        // Store init args — but replace the callback function with a flag
        // since functions can't be serialized across the Playwright boundary
        (window as any)._gisInitArgs = {
          client_id: args.client_id,
          auto_select: args.auto_select,
          cancel_on_tap_outside: args.cancel_on_tap_outside,
          hasCallback: typeof args.callback === 'function',
        };
      },
      prompt: function(momentListener?: (n: any) => void) {
        (window as any)._gisCalls.push('prompt');
        if (momentListener && promptBehavior !== 'silent') {
          var notification: any = {};
          if (promptBehavior === 'not_displayed') {
            notification.isNotDisplayed = function() { return true; };
            notification.isSkippedMoment = function() { return false; };
            notification.isDismissedMoment = function() { return false; };
            notification.getNotDisplayedReason = function() { return 'browser_not_supported'; };
          } else if (promptBehavior === 'skipped') {
            notification.isNotDisplayed = function() { return false; };
            notification.isSkippedMoment = function() { return true; };
            notification.isDismissedMoment = function() { return false; };
            notification.getSkippedReason = function() { return 'user_cancel'; };
          } else {
            // success — dismissed by user (means it showed)
            notification.isNotDisplayed = function() { return false; };
            notification.isSkippedMoment = function() { return false; };
            notification.isDismissedMoment = function() { return true; };
          }
          setTimeout(function() { momentListener!(notification); }, 10);
        }
      },
      disableAutoSelect: function() {
        (window as any)._gisCalls.push('disableAutoSelect');
      },
    };

    // Set up google.accounts.id before head.html runs.
    // Use Object.defineProperty to prevent the real GIS script (async)
    // from overwriting our mock when it loads.
    Object.defineProperty(window, 'google', {
      value: { accounts: { id: mockGis } },
      writable: false,
      configurable: true,
    });
  }, { user: MOCK_FIREBASE_USER, promptBehavior, isMobile, isFirefox });
}

// ---------------------------------------------------------------------------
// Firefox sign-in flow
// ---------------------------------------------------------------------------
test.describe('Login Flows — Firefox', () => {
  test.beforeEach(async ({ page }) => {
    // Block real GIS script to prevent it from overwriting our mock
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());
  });

  test('dmSignIn uses signInWithPopup on Firefox, not GIS prompt', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: true });
    await page.goto('./');

    // Call dmSignIn
    await page.evaluate(() => (window as any).dmSignIn());
    // Give it time to execute
    await page.waitForTimeout(200);

    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    const gisCalls = await page.evaluate(() => (window as any)._gisCalls);

    expect(authCalls).toContain('signInWithPopup');
    expect(gisCalls).not.toContain('prompt');
  });

  test('Firefox sign-in clears dm-gis-signed-out flag', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: true });
    await page.addInitScript(() => {
      localStorage.setItem('dm-gis-signed-out', '1');
    });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(200);

    const flag = await page.evaluate(() => localStorage.getItem('dm-gis-signed-out'));
    expect(flag).toBeNull();
  });

  test('Firefox sign-in emits auth state to subscribers', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: true });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(200);

    const currentUser = await page.evaluate(() => (window as any)._mockAuthCurrentUser);
    expect(currentUser).toBeTruthy();
    expect(currentUser.email).toBe('test@example.com');
  });
});

// ---------------------------------------------------------------------------
// Desktop Chrome sign-in flow (GIS prompt)
// ---------------------------------------------------------------------------
test.describe('Login Flows — Desktop Chrome (GIS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());
  });

  test('dmSignIn uses GIS prompt on non-Firefox desktop', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false, isMobile: false });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(200);

    const gisCalls = await page.evaluate(() => (window as any)._gisCalls);
    const authCalls = await page.evaluate(() => (window as any)._authCalls);

    expect(gisCalls).toContain('initialize');
    expect(gisCalls).toContain('prompt');
    // Should NOT fall back to signInWithPopup when prompt succeeds
    expect(authCalls).not.toContain('signInWithPopup');
  });

  test('GIS prompt not_displayed falls back to signInWithPopup', async ({ page }) => {
    await injectMockAuthAndGis(page, {
      isFirefox: false,
      isMobile: false,
      promptBehavior: 'not_displayed',
    });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(300);

    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    expect(authCalls).toContain('signInWithPopup');
  });

  test('GIS prompt skipped falls back to signInWithPopup', async ({ page }) => {
    await injectMockAuthAndGis(page, {
      isFirefox: false,
      isMobile: false,
      promptBehavior: 'skipped',
    });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(300);

    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    expect(authCalls).toContain('signInWithPopup');
  });

  test('desktop does NOT eagerly initialize GIS on page load', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false, isMobile: false });
    await page.goto('./');

    // Wait long enough for autoInitGis polling to have run (if it were enabled)
    await page.waitForTimeout(500);

    const gisCalls = await page.evaluate(() => (window as any)._gisCalls);
    // GIS should not have been initialized until user clicks sign-in
    expect(gisCalls).not.toContain('initialize');
  });

  test('desktop GIS auto_select is always false', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false, isMobile: false });
    await page.goto('./');

    // Trigger sign-in to force GIS initialization
    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(200);

    const initArgs = await page.evaluate(() => (window as any)._gisInitArgs);
    expect(initArgs).toBeTruthy();
    expect(initArgs.auto_select).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mobile sign-in flow (eager GIS init + auto_select)
// ---------------------------------------------------------------------------
test.describe('Login Flows — Mobile (Eager GIS Init)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());
  });

  test('mobile eagerly initializes GIS on page load', async ({ page }) => {
    await injectMockAuthAndGis(page, { isMobile: true, isFirefox: false });
    await page.goto('./');

    // Wait for the autoInitGis polling to complete
    await page.waitForTimeout(500);

    const gisCalls = await page.evaluate(() => (window as any)._gisCalls);
    expect(gisCalls).toContain('initialize');
  });

  test('mobile GIS auto_select is true when user has not signed out', async ({ page }) => {
    await injectMockAuthAndGis(page, { isMobile: true, isFirefox: false });
    await page.goto('./');

    await page.waitForTimeout(500);

    const initArgs = await page.evaluate(() => (window as any)._gisInitArgs);
    expect(initArgs).toBeTruthy();
    expect(initArgs.auto_select).toBe(true);
  });

  test('mobile GIS auto_select is false when dm-gis-signed-out is set', async ({ page }) => {
    await injectMockAuthAndGis(page, { isMobile: true, isFirefox: false });
    await page.addInitScript(() => {
      localStorage.setItem('dm-gis-signed-out', '1');
    });
    await page.goto('./');

    await page.waitForTimeout(500);

    const initArgs = await page.evaluate(() => (window as any)._gisInitArgs);
    expect(initArgs).toBeTruthy();
    expect(initArgs.auto_select).toBe(false);
  });

  test('mobile GIS initialize receives the correct callback and client_id', async ({ page }) => {
    await injectMockAuthAndGis(page, { isMobile: true, isFirefox: false });
    await page.goto('./');

    await page.waitForTimeout(500);

    const initArgs = await page.evaluate(() => (window as any)._gisInitArgs);
    expect(initArgs).toBeTruthy();
    expect(initArgs.hasCallback).toBe(true);
    expect(initArgs.client_id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sign-out flow (dmSignOut)
// ---------------------------------------------------------------------------
test.describe('Login Flows — Sign-out', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());
  });

  test('dmSignOut sets dm-gis-signed-out flag', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignOut());
    await page.waitForTimeout(100);

    const flag = await page.evaluate(() => localStorage.getItem('dm-gis-signed-out'));
    expect(flag).toBe('1');
  });

  test('dmSignOut calls GIS disableAutoSelect', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignOut());
    await page.waitForTimeout(100);

    const gisCalls = await page.evaluate(() => (window as any)._gisCalls);
    expect(gisCalls).toContain('disableAutoSelect');
  });

  test('dmSignOut calls auth.signOut()', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignOut());
    await page.waitForTimeout(100);

    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    expect(authCalls).toContain('signOut');
  });

  test('dmSignOut emits null user to subscribers', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false });
    await page.goto('./');

    // First sign in
    await page.evaluate(() => (window as any)._mockAuthEmit({
      uid: 'x', displayName: 'X', email: 'x@x.com', photoURL: '',
    }));
    await page.waitForTimeout(100);

    // Then sign out
    await page.evaluate(() => (window as any).dmSignOut());
    await page.waitForTimeout(100);

    const currentUser = await page.evaluate(() => (window as any)._mockAuthCurrentUser);
    expect(currentUser).toBeNull();
  });

  test('sign-in after sign-out clears the dm-gis-signed-out flag', async ({ page }) => {
    await injectMockAuthAndGis(page, { isFirefox: false });
    await page.goto('./');

    // Sign out first
    await page.evaluate(() => (window as any).dmSignOut());
    await page.waitForTimeout(100);

    let flag = await page.evaluate(() => localStorage.getItem('dm-gis-signed-out'));
    expect(flag).toBe('1');

    // Now sign in again
    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(200);

    flag = await page.evaluate(() => localStorage.getItem('dm-gis-signed-out'));
    expect(flag).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GIS prompt fallback edge cases
// ---------------------------------------------------------------------------
test.describe('Login Flows — GIS Prompt Fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());
  });

  test('silent GIS failure (no moment callback) does not crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await injectMockAuthAndGis(page, {
      isFirefox: false,
      isMobile: false,
      promptBehavior: 'silent',
    });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('GIS prompt success does not trigger fallback', async ({ page }) => {
    await injectMockAuthAndGis(page, {
      isFirefox: false,
      isMobile: false,
      promptBehavior: 'success',
    });
    await page.goto('./');

    await page.evaluate(() => (window as any).dmSignIn());
    await page.waitForTimeout(300);

    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    expect(authCalls).not.toContain('signInWithPopup');
  });

  test('multiple rapid dmSignIn calls do not cause errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await injectMockAuthAndGis(page, { isFirefox: true });
    await page.goto('./');

    // Call dmSignIn 3 times rapidly
    await page.evaluate(() => {
      (window as any).dmSignIn();
      (window as any).dmSignIn();
      (window as any).dmSignIn();
    });
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    // All 3 should have called signInWithPopup
    const popupCalls = authCalls.filter((c: string) => c === 'signInWithPopup');
    expect(popupCalls.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// No JS errors on any login flow
// ---------------------------------------------------------------------------
test.describe('Login Flows — No JS Errors', () => {
  test('page loads without errors (desktop, no mock GIS)', async ({ page }) => {
    // Without injecting mock GIS, the real GIS script may or may not load.
    // head.html should handle the case where GIS is not available gracefully.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('./');
    await page.waitForTimeout(1000);

    // Filter out errors from external scripts (GIS, analytics) that we don't control
    const appErrors = errors.filter(e =>
      !e.includes('google') && !e.includes('gsi') && !e.includes('gtag')
    );
    expect(appErrors).toEqual([]);
  });

  test('dmSignIn does not crash when GIS library is not loaded', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Block the real GIS script so google.accounts.id never becomes available
    await page.route('**/accounts.google.com/gsi/client*', route => route.abort());

    // Inject mock auth but NO mock GIS — simulates GIS script failing to load
    await page.addInitScript(({ user }) => {
      (window as any)._authCalls = [] as string[];
      (window as any)._mockAuthSubscribers = [] as Array<(u: any) => void>;
      (window as any)._mockAuthCurrentUser = null;
      (window as any)._mockAuthEmit = function(newUser: any) {
        (window as any)._mockAuthCurrentUser = newUser;
        var subs = (window as any)._mockAuthSubscribers;
        for (var i = 0; i < subs.length; i++) subs[i](newUser);
      };

      var mockAuth = {
        get currentUser() { return (window as any)._mockAuthCurrentUser; },
        onAuthStateChanged: function(cb: (u: any) => void) {
          (window as any)._mockAuthSubscribers.push(cb);
          setTimeout(function() { cb(null); }, 0);
          return function() {};
        },
        signOut: function() { return Promise.resolve(); },
        signInWithCredential: function() { return Promise.resolve({ user: user }); },
        signInWithPopup: function() {
          (window as any)._authCalls.push('signInWithPopup');
          (window as any)._mockAuthEmit(user);
          return Promise.resolve({ user: user });
        },
        signInWithRedirect: function() { return Promise.resolve(); },
        getRedirectResult: function() { return Promise.resolve(null); },
      };

      Object.defineProperty(window, 'dmAuth', {
        get() { return mockAuth; },
        set() {},
        configurable: true,
      });
      Object.defineProperty(window, 'dmGoogleProvider', {
        get() { return { providerId: 'google.com' }; },
        set() {},
        configurable: true,
      });
      Object.defineProperty(window, 'dmRegisterUser', {
        get() { return function() {}; },
        set() {},
        configurable: true,
      });
    }, { user: MOCK_FIREBASE_USER });

    await page.goto('./');

    // dmSignIn should not crash — it should retry and eventually call fallbackPopupSignIn
    await page.evaluate(() => (window as any).dmSignIn());

    // Wait for the retry loop (~5 seconds max, but fallback fires at end)
    await page.waitForTimeout(6000);

    const appErrors = errors.filter(e =>
      !e.includes('google') && !e.includes('gsi') && !e.includes('gtag')
    );
    expect(appErrors).toEqual([]);

    // Should have eventually fallen back to signInWithPopup
    const authCalls = await page.evaluate(() => (window as any)._authCalls);
    expect(authCalls).toContain('signInWithPopup');
  });
});
