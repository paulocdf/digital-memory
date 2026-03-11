# Plan: Comprehensive Login Flow Tests

## Goal
Add ~25-30 new Playwright tests to `tests/auth-persistence.spec.ts` that cover every auth code path, preventing login regressions.

## Key Design: Mock Auth Emitter

A new `injectMockAuth(page, initialUser?)` helper that replaces Firebase Auth with a controllable mock using `addInitScript` + `Object.defineProperty`. This intercepts `window.dmAuth` before head.html assigns `firebase.auth()` to it.

The mock provides:
- `onAuthStateChanged(callback)` — registers listeners, fires asynchronously on subscribe
- `signOut()` — emits null, clears dm-cached-user
- `signInWithPopup()` — resolves with mock user
- `currentUser` — tracks current user
- `window._mockAuthEmit(user)` — test hook to trigger state transitions
- `window._mockAuthSubscribers` — array of registered listeners

The mock also:
- Pre-populates `dm-cached-user` in localStorage when initialUser is provided
- Replaces `dmSignIn` and `dmRegisterUser` with controlled versions
- Lets head.html's `waitForAuthState()` and `dmAuthReady` work naturally since they call `onAuthStateChanged` on the mock

### Mock User Constants

```typescript
const MOCK_FIREBASE_USER = {
  uid: 'test-uid-123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/avatar.png',
};
```

## Test Groups

### Group 1: Sign-out Flow (5 tests)

1. **Garden-hero sign-out clears cached user and shows sign-in button**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - Verify sign-in hidden, user info visible
   - Click `#garden-signout`
   - Assert `dm-cached-user` removed from localStorage
   - Assert `#garden-signin` visible, `#garden-auth-user` hidden

2. **Settings-modal sign-out clears cached user**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - Open settings modal via `window.openSettingsModal()`
   - Click `#settings-modal-signout`
   - Assert `dm-cached-user` removed from localStorage

3. **Quick-capture sign-out clears cached user**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./docs/inbox/`
   - Click `#qc-signout`
   - Assert `dm-cached-user` removed from localStorage

4. **Sign-out on app page shows auth card**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./docs/inbox/`
   - Wait for auth card to be hidden (user is signed in)
   - Call `page.evaluate(() => window._mockAuthEmit(null))`
   - Assert `.single-note-auth` becomes visible

5. **Sign-out dispatches dm-sync-complete event**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./docs/inbox/`
   - Set up event listener: `page.evaluate(() => { window._syncCompleteCount = 0; window.addEventListener('dm-sync-complete', () => window._syncCompleteCount++); })`
   - Call `page.evaluate(() => window._mockAuthEmit(null))`
   - Note: dm-sync-complete is dispatched by dm-sync.html's handleSyncAuth after IDB clear. Since our mock doesn't run the real dm-sync.html handler, we verify the auth card change instead. This test may need adjustment.

### Group 2: onAuthStateChanged Transitions (4 tests)

1. **null→user transition on shortcode page hides auth card**
   - `injectMockAuth(page, null)` → goto `./docs/inbox/`
   - Assert `.single-note-auth` visible (signed out)
   - `page.evaluate(() => window._mockAuthEmit(MOCK_FIREBASE_USER))`
   - Assert `.single-note-auth` hidden

2. **user→null transition on shortcode page shows auth card**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./docs/board/`
   - Assert `.kanban-auth` hidden
   - `page.evaluate(() => window._mockAuthEmit(null))`
   - Assert `.kanban-auth` visible

3. **null→user on landing page hides sign-in, shows user info**
   - `injectMockAuth(page, null)` → goto `./`
   - Assert `#garden-signin` visible
   - `page.evaluate(() => window._mockAuthEmit(MOCK_FIREBASE_USER))`
   - Note: This will trigger auto-redirect to inbox since wasSignedInOnLoad=false. Need to handle navigation.

4. **user→null on landing page shows sign-in, hides user info**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - Assert `#garden-signin` hidden, `#garden-auth-user` visible
   - `page.evaluate(() => window._mockAuthEmit(null))`
   - Assert `#garden-signin` visible, `#garden-auth-user` hidden

### Group 3: dm-cached-user localStorage Contract (5 tests)

1. **Auth sign-in writes dm-cached-user to localStorage**
   - `injectMockAuth(page, null)` → goto `./docs/inbox/`
   - Assert `dm-cached-user` is null in localStorage
   - `page.evaluate(() => window._mockAuthEmit(MOCK_FIREBASE_USER))`
   - Assert localStorage has `dm-cached-user` with correct JSON shape

2. **Auth sign-out clears dm-cached-user from localStorage**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./docs/inbox/`
   - Assert `dm-cached-user` exists in localStorage
   - `page.evaluate(() => window._mockAuthEmit(null))`
   - Assert `dm-cached-user` removed from localStorage

3. **dm-cached-user has correct shape: { displayName, email, photoURL }**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - Read localStorage and parse JSON
   - Assert has exactly `displayName`, `email`, `photoURL` keys
   - Assert values match MOCK_FIREBASE_USER

4. **Corrupted dm-cached-user doesn't crash page**
   - `page.addInitScript(() => localStorage.setItem('dm-cached-user', 'not valid json{{{'))` → goto `./docs/inbox/`
   - Collect JS errors via `page.on('pageerror', ...)`
   - Assert no errors (the try/catch in shortcodes handles invalid JSON)

5. **dm-cached-user is not written for null user**
   - `injectMockAuth(page, null)` → goto `./`
   - Assert `dm-cached-user` is null in localStorage (not written)

### Group 4: garden-sections Auth Gating (3 tests)

1. **Without cached user: sections show "Sign in" messages**
   - `injectMockAuth(page, null)` → goto `./`
   - Wait for auth to settle
   - Assert `#garden-section-books` contains "Sign in to see your notes"
   - Assert `#garden-section-inbox` contains "Sign in to see your notes"

2. **With cached user (frozen auth): sections do NOT show "Sign in"**
   - `injectCachedUserAndFreezeAuth(page)` → goto `./`
   - Assert `#garden-section-books` does NOT contain "Sign in"
   - Assert `#garden-section-inbox` does NOT contain "Sign in"

3. **After sign-out: sections show "Sign in" messages**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - `page.evaluate(() => window._mockAuthEmit(null))`
   - Assert sections show "Sign in" messages

### Group 5: Auto-Redirect After Login (3 tests)

1. **Fresh login on front page redirects to inbox**
   - `injectMockAuth(page, null)` → goto `./` (no cached user → wasSignedInOnLoad=false)
   - `page.evaluate(() => window._mockAuthEmit(MOCK_FIREBASE_USER))`
   - Wait for URL change → assert URL contains "inbox"

2. **Returning user on front page does NOT redirect**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./` (cached user → wasSignedInOnLoad=true)
   - Wait 1-2 seconds
   - Assert URL still contains `./` (landing page), not "inbox"

3. **Auto-redirect doesn't fire on non-front pages**
   - `injectMockAuth(page, null)` → goto `./docs/board/`
   - `page.evaluate(() => window._mockAuthEmit(MOCK_FIREBASE_USER))`
   - Wait 1 second
   - Assert URL still contains "board" (no redirect to inbox)

### Group 6: SPA Nav Auth Preservation (3 tests)

1. **SPA nav from landing to inbox: mock auth user sees content**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - Click `.section-card.card-inbox h3 a` (SPA nav to inbox)
   - Wait for URL to contain "inbox"
   - Assert `.single-note-auth` is hidden (user is still authenticated)

2. **SPA nav to board after sign-out shows auth card**
   - `injectMockAuth(page, null)` → goto `./`
   - Use SPA nav to board (sidebar link)
   - Assert `.kanban-auth` visible (user is signed out)

3. **Auth state persists across multiple SPA navigations**
   - `injectMockAuth(page, MOCK_FIREBASE_USER)` → goto `./`
   - SPA nav to inbox → verify auth hidden
   - SPA nav to board (via sidebar) → verify auth hidden
   - SPA nav back to landing → verify user info visible

### Group 7: Redirect Sign-in Flow (3 tests)

1. **dm-pending-redirect is set on popup-blocked error**
   - `injectMockAuth(page, null)` → goto `./`
   - Override mock's signInWithPopup to reject with `{ code: 'auth/popup-blocked' }`
   - Note: Since dmSignIn is replaced by our mock, we need to test the original logic. Alternative: inject a version of dmSignIn that uses the mock auth but has the real error handling logic.
   - Simpler approach: verify the sessionStorage contract directly
   - `page.evaluate(() => sessionStorage.setItem('dm-pending-redirect', '1'))`
   - Navigate to a page
   - Assert sessionStorage no longer has `dm-pending-redirect` (head.html clears it)

2. **dm-pending-redirect flag is cleared on page load**
   - `page.addInitScript(() => sessionStorage.setItem('dm-pending-redirect', '1'))`
   - goto `./docs/inbox/`
   - Assert `sessionStorage.getItem('dm-pending-redirect')` is null

3. **Page loads without errors when dm-pending-redirect is set**
   - Collect JS errors
   - `page.addInitScript(() => sessionStorage.setItem('dm-pending-redirect', '1'))`
   - goto `./docs/inbox/`
   - Assert no JS errors

## Implementation Notes

1. All new tests added to existing `tests/auth-persistence.spec.ts`
2. `injectMockAuth` helper defined alongside existing helpers at top of file
3. Tests that use `_mockAuthEmit` need `page.evaluate` since the function is in page context
4. Some tests in Group 2/5 involve navigation (auto-redirect); use `page.waitForURL` with timeout
5. The mock auth emitter must be compatible with dm-sync.html's `handleSyncAuth` — since dm-sync.html also subscribes to `onAuthStateChanged`, our mock will trigger it too. But since dm-sync.html tries to use `dmDb` (Firestore), those calls will fail silently. This is acceptable.
6. For Group 6, SPA navigation re-executes shortcode scripts. The new scripts call `onAuthStateChanged` on our mock, which fires with the current user state. This correctly tests the real flow.

## Files Modified
- `tests/auth-persistence.spec.ts` — Add mock auth emitter and ~25-30 new tests

## Verification
- `hugo` build (changes are test-only, no production code changes needed)
- `npx playwright test tests/auth-persistence.spec.ts` — all tests pass
- `npx playwright test` — full suite passes with no regressions
