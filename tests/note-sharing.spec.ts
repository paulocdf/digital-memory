import { test, expect, Page } from '@playwright/test';

// ── Constants ──

const MOCK_USER = {
  uid: 'test-user-owner',
  displayName: 'Owner User',
  email: 'owner@example.com',
  photoURL: 'https://example.com/owner.png',
};

const MOCK_COLLABORATOR = {
  uid: 'test-user-collab',
  displayName: 'Collab User',
  email: 'collab@example.com',
  photoURL: 'https://example.com/collab.png',
};

const DB_NAME = 'dm-notes';
const DB_VERSION = 15;

// ── Factories ──

function makeNote(id: string, title: string, userId: string, opts: Record<string, any> = {}) {
  return {
    id,
    title,
    content: opts.content || 'Test note content for ' + title,
    mode: opts.mode || 'note',
    destination: opts.destination || 'inbox',
    language: opts.language || null,
    bookTitle: opts.bookTitle || null,
    tags: opts.tags || [],
    userId,
    userEmail: opts.userEmail || 'owner@example.com',
    userName: opts.userName || 'Owner User',
    pinned: opts.pinned || false,
    collaborators: opts.collaborators || [userId],
    deletedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

function makeNoteShare(
  noteId: string,
  inviteeUid: string,
  opts: Record<string, any> = {}
) {
  const shareId = noteId + '_' + inviteeUid;
  return {
    id: shareId,
    noteId,
    noteTitle: opts.noteTitle || 'Shared Note',
    ownerId: opts.ownerId || MOCK_USER.uid,
    ownerEmail: opts.ownerEmail || MOCK_USER.email,
    ownerName: opts.ownerName || MOCK_USER.displayName,
    inviteeEmail: opts.inviteeEmail || MOCK_COLLABORATOR.email,
    inviteeUid,
    status: opts.status || 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

// ── Auth Mock ──

/**
 * Inject mock Firebase Auth for a given user.
 * Mirrors the pattern from auth-persistence.spec.ts.
 */
function injectMockAuth(page: Page, user: typeof MOCK_USER) {
  return page.addInitScript((u) => {
    // Pre-populate cached user
    localStorage.setItem('dm-cached-user', JSON.stringify({
      displayName: u.displayName || '',
      email: u.email || '',
      photoURL: u.photoURL || '',
    }));

    (window as any)._mockAuthSubscribers = [] as Array<(user: any) => void>;
    (window as any)._mockAuthCurrentUser = u;

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
      for (var i = 0; i < subs.length; i++) {
        subs[i](newUser);
      }
    };

    var mockAuth = {
      get currentUser() { return (window as any)._mockAuthCurrentUser; },
      onAuthStateChanged: function(callback: (user: any) => void) {
        (window as any)._mockAuthSubscribers.push(callback);
        var currentUser = (window as any)._mockAuthCurrentUser;
        setTimeout(function() { callback(currentUser); }, 0);
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
      signInWithCredential: function() {
        (window as any)._mockAuthEmit(u);
        return Promise.resolve({ user: u });
      },
      signInWithPopup: function() { return Promise.resolve({ user: null }); },
      signInWithRedirect: function() { return Promise.resolve(); },
      getRedirectResult: function() { return Promise.resolve(null); },
    };

    var _mockAuth = mockAuth;
    Object.defineProperty(window, 'dmAuth', {
      get() { return _mockAuth; },
      set() {},
      configurable: true,
    });

    var _dmDb: any = null;
    Object.defineProperty(window, 'dmDb', {
      get() { return _dmDb; },
      set(v) { _dmDb = v; },
      configurable: true,
    });

    Object.defineProperty(window, 'dmSignIn', {
      get() { return function() { mockAuth.signInWithCredential(); }; },
      set() {},
      configurable: true,
    });
    Object.defineProperty(window, 'dmRegisterUser', {
      get() { return function() {}; },
      set() {},
      configurable: true,
    });
  }, user);
}

// ── IDB Helpers ──

/** Seed a note directly into IDB. */
async function seedNote(page: Page, note: Record<string, any>) {
  await page.evaluate(
    ({ note, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('notes', 'readwrite');
          tx.objectStore('notes').put(note);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { note, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Seed a noteShare directly into IDB. */
async function seedNoteShare(page: Page, share: Record<string, any>) {
  await page.evaluate(
    ({ share, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('noteShares', 'readwrite');
          tx.objectStore('noteShares').put(share);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { share, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Read a noteShare from IDB by ID. */
async function getNoteShareFromIdb(page: Page, shareId: string) {
  return page.evaluate(
    ({ shareId, dbName, dbVersion }) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('noteShares', 'readonly');
          const getReq = tx.objectStore('noteShares').get(shareId);
          getReq.onsuccess = () => { db.close(); resolve(getReq.result || null); };
          getReq.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { shareId, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Read all noteShares from IDB. */
async function getAllNoteSharesFromIdb(page: Page) {
  return page.evaluate(
    ({ dbName, dbVersion }) => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('noteShares', 'readonly');
          const getAll = tx.objectStore('noteShares').getAll();
          getAll.onsuccess = () => { db.close(); resolve(getAll.result); };
          getAll.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Clean up test data from IDB. */
async function cleanupData(page: Page, noteIds: string[], shareIds: string[]) {
  await page.evaluate(
    ({ noteIds, shareIds, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['notes', 'noteShares'], 'readwrite');
          const noteStore = tx.objectStore('notes');
          const shareStore = tx.objectStore('noteShares');
          noteIds.forEach((id: string) => noteStore.delete(id));
          shareIds.forEach((id: string) => shareStore.delete(id));
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { noteIds, shareIds, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Wait for dmSync to be fully available. */
async function waitForDmSync(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).dmSync && !!(window as any).dmSync.putNote && !!(window as any).dmSync.getSharesForNote,
    { timeout: 10000 }
  );
}

// ═══════════════════════════════════════
// Tests
// ═══════════════════════════════════════

test.describe('Note Sharing — Data Layer', () => {
  const NOTE_ID = 'ns-test-note-1';
  const NOTE = makeNote(NOTE_ID, 'Test Sharing Note', MOCK_USER.uid);
  const SHARE_ID = NOTE_ID + '_' + MOCK_COLLABORATOR.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
    await seedNote(page, NOTE);
  });

  test.afterEach(async ({ page }) => {
    await cleanupData(page, [NOTE_ID], [SHARE_ID]);
  });

  test('getSharesForNote returns empty array when no shares exist', async ({ page }) => {
    const shares = await page.evaluate((noteId) => {
      return (window as any).dmSync.getSharesForNote(noteId);
    }, NOTE_ID);

    expect(shares).toEqual([]);
  });

  test('seeded share is retrievable via getSharesForNote', async ({ page }) => {
    const share = makeNoteShare(NOTE_ID, MOCK_COLLABORATOR.uid, {
      noteTitle: NOTE.title,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    const shares = await page.evaluate((noteId) => {
      return (window as any).dmSync.getSharesForNote(noteId);
    }, NOTE_ID);

    expect(shares).toHaveLength(1);
    expect(shares[0].id).toBe(SHARE_ID);
    expect(shares[0].noteId).toBe(NOTE_ID);
    expect(shares[0].inviteeEmail).toBe(MOCK_COLLABORATOR.email);
    expect(shares[0].status).toBe('pending');
  });

  test('getPendingNoteInvites returns pending shares for current user as invitee', async ({ page }) => {
    // Seed a share where current user is the invitee
    const share = makeNoteShare('ns-other-note', MOCK_USER.uid, {
      noteTitle: 'Someone Else Note',
      ownerId: 'other-owner-uid',
      ownerEmail: 'other@example.com',
      ownerName: 'Other Owner',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    const invites = await page.evaluate(() => {
      return (window as any).dmSync.getPendingNoteInvites();
    });

    expect(invites.length).toBeGreaterThanOrEqual(1);
    const found = invites.find((inv: any) => inv.id === share.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe('pending');
    expect(found.noteTitle).toBe('Someone Else Note');

    // Cleanup extra share
    await cleanupData(page, ['ns-other-note'], [share.id]);
  });

  test('getPendingNoteInvites excludes accepted shares', async ({ page }) => {
    const share = makeNoteShare('ns-accepted-note', MOCK_USER.uid, {
      noteTitle: 'Already Accepted',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedNoteShare(page, share);

    const invites = await page.evaluate(() => {
      return (window as any).dmSync.getPendingNoteInvites();
    });

    const found = invites.find((inv: any) => inv.id === share.id);
    expect(found).toBeFalsy();

    await cleanupData(page, ['ns-accepted-note'], [share.id]);
  });

  test('getMyNoteShares returns shares owned by current user', async ({ page }) => {
    const share = makeNoteShare(NOTE_ID, MOCK_COLLABORATOR.uid, {
      noteTitle: NOTE.title,
      ownerId: MOCK_USER.uid,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    const myShares = await page.evaluate(() => {
      return (window as any).dmSync.getMyNoteShares();
    });

    expect(myShares.length).toBeGreaterThanOrEqual(1);
    const found = myShares.find((s: any) => s.id === SHARE_ID);
    expect(found).toBeTruthy();
    expect(found.ownerId).toBe(MOCK_USER.uid);
  });
});

test.describe('Note Sharing — Edit Modal UI', () => {
  const NOTE_ID = 'ns-modal-note-1';
  const NOTE = makeNote(NOTE_ID, 'Modal Sharing Note', MOCK_USER.uid);
  const SHARE_ID = NOTE_ID + '_' + MOCK_COLLABORATOR.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
    await seedNote(page, NOTE);
  });

  test.afterEach(async ({ page }) => {
    await cleanupData(page, [NOTE_ID], [SHARE_ID]);
  });

  test('sharing section is visible when owner opens edit modal', async ({ page }) => {
    // Open the edit modal with the test note
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    // The sharing section should be visible
    const sharingSection = page.locator('#note-edit-sharing-section');
    await expect(sharingSection).toBeVisible();

    // Share controls (email input + send button) should be visible for owner
    const shareControls = page.locator('#note-edit-share-controls');
    await expect(shareControls).toBeVisible();

    // Owner info banner should NOT be visible (user is the owner)
    const ownerInfo = page.locator('#note-edit-share-owner-info');
    await expect(ownerInfo).not.toBeVisible();
  });

  test('sharing section shows email input and share button for owner', async ({ page }) => {
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    const emailInput = page.locator('#note-edit-share-email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'Enter email to share...');

    const sendBtn = page.locator('#note-edit-share-send');
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toHaveText('Share');
  });

  test('sharing section shows "Not shared with anyone" when no shares exist', async ({ page }) => {
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    // Wait for share list to load
    await page.waitForTimeout(300);

    const shareList = page.locator('#note-edit-share-list');
    await expect(shareList).toContainText('Not shared with anyone');
  });

  test('share list displays existing collaborators with status', async ({ page }) => {
    // Seed a pending share
    const share = makeNoteShare(NOTE_ID, MOCK_COLLABORATOR.uid, {
      noteTitle: NOTE.title,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    // Wait for share list to render
    await page.waitForTimeout(500);

    const shareItem = page.locator('.note-edit-share-item');
    await expect(shareItem).toHaveCount(1);

    const itemEmail = shareItem.locator('.note-edit-share-item-email');
    await expect(itemEmail).toContainText(MOCK_COLLABORATOR.email);

    const itemStatus = shareItem.locator('.note-edit-share-item-status');
    await expect(itemStatus).toContainText('pending');
    await expect(itemStatus).toHaveClass(/status-pending/);
  });

  test('share list shows accepted status for accepted shares', async ({ page }) => {
    const share = makeNoteShare(NOTE_ID, MOCK_COLLABORATOR.uid, {
      noteTitle: NOTE.title,
      status: 'accepted',
    });
    await seedNoteShare(page, share);

    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    await page.waitForTimeout(500);

    const itemStatus = page.locator('.note-edit-share-item-status');
    await expect(itemStatus).toContainText('accepted');
    await expect(itemStatus).toHaveClass(/status-accepted/);
  });

  test('remove button is visible on share list items', async ({ page }) => {
    const share = makeNoteShare(NOTE_ID, MOCK_COLLABORATOR.uid, {
      noteTitle: NOTE.title,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    await page.waitForTimeout(500);

    const removeBtn = page.locator('.note-edit-share-item-remove');
    await expect(removeBtn).toHaveCount(1);
    await expect(removeBtn).toHaveAttribute('data-note-unshare-id', SHARE_ID);
  });

  test('collaborator view shows owner info and hides share controls', async ({ page }) => {
    // Open modal as a collaborator (note owned by someone else)
    const collabNote = makeNote(NOTE_ID, 'Collab View Note', 'other-owner-uid', {
      userEmail: 'other@example.com',
      userName: 'Other Owner',
      collaborators: ['other-owner-uid', MOCK_USER.uid],
    });

    // Seed a share to provide owner info
    const share = makeNoteShare(NOTE_ID, MOCK_USER.uid, {
      noteTitle: collabNote.title,
      ownerId: 'other-owner-uid',
      ownerEmail: 'other@example.com',
      ownerName: 'Other Owner',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedNote(page, collabNote);
    await seedNoteShare(page, share);

    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, collabNote);

    await page.waitForTimeout(500);

    // Share controls should be hidden (not the owner)
    const shareControls = page.locator('#note-edit-share-controls');
    await expect(shareControls).not.toBeVisible();

    // Owner info should be visible
    const ownerInfo = page.locator('#note-edit-share-owner-info');
    await expect(ownerInfo).toBeVisible();
    await expect(ownerInfo).toContainText('Other Owner');

    await cleanupData(page, [], [share.id]);
  });

  test('closing and reopening modal resets sharing state', async ({ page }) => {
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    await page.waitForTimeout(300);
    const sharingSection = page.locator('#note-edit-sharing-section');
    await expect(sharingSection).toBeVisible();

    // Close
    await page.evaluate(() => {
      (window as any).dmEditModal.close();
    });

    // Sharing section should be hidden now
    await expect(sharingSection).not.toBeVisible();

    // Reopen
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    await page.waitForTimeout(300);
    await expect(sharingSection).toBeVisible();
    await expect(page.locator('#note-edit-share-list')).toContainText('Not shared with anyone');
  });

  test('sharing section header shows people icon and "Sharing" label', async ({ page }) => {
    await page.evaluate((note) => {
      (window as any).dmEditModal.open(note);
    }, NOTE);

    const header = page.locator('.note-edit-sharing-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Sharing');

    // SVG icon should be present
    const icon = header.locator('svg');
    await expect(icon).toBeAttached();
  });
});

test.describe('Note Sharing — Invitation Banners', () => {
  const NOTE_ID = 'ns-invite-note-1';
  const SHARE_ID = NOTE_ID + '_' + MOCK_USER.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
  });

  test.afterEach(async ({ page }) => {
    await cleanupData(page, [NOTE_ID], [SHARE_ID]);
  });

  test('pending note invitation renders a banner card', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    // Seed a pending note share invitation for the current user
    const share = makeNoteShare(NOTE_ID, MOCK_USER.uid, {
      noteTitle: 'Invited Note Title',
      ownerId: 'other-owner-uid',
      ownerEmail: 'sharer@example.com',
      ownerName: 'Sharer Person',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    // Trigger the invitation load by dispatching the event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });

    // Wait for the banner to render
    await page.waitForTimeout(1000);

    const banner = page.locator('#dm-note-invitations-banner');
    const card = banner.locator('.dm-invitation-card');
    await expect(card).toHaveCount(1);

    // Should show "Note Shared With You"
    const header = card.locator('.dm-invitation-header');
    await expect(header).toContainText('Note Shared With You');

    // Should show the sharer's name
    const body = card.locator('.dm-invitation-body');
    await expect(body).toContainText('Sharer Person');
    await expect(body).toContainText('shared a note');
    await expect(body).toContainText('Invited Note Title');
  });

  test('accept and decline buttons are present on invitation card', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeNoteShare(NOTE_ID, MOCK_USER.uid, {
      noteTitle: 'Buttons Test Note',
      ownerId: 'other-owner-uid',
      ownerEmail: 'sharer@example.com',
      ownerName: 'Sharer',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const card = page.locator('#dm-note-invitations-banner .dm-invitation-card');
    const acceptBtn = card.locator('[data-note-accept-id]');
    const declineBtn = card.locator('[data-note-decline-id]');

    await expect(acceptBtn).toHaveCount(1);
    await expect(acceptBtn).toHaveText('Accept');
    await expect(declineBtn).toHaveCount(1);
    await expect(declineBtn).toHaveText('Decline');
  });

  test('dismiss button removes invitation card with animation', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeNoteShare(NOTE_ID, MOCK_USER.uid, {
      noteTitle: 'Dismiss Test',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedNoteShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const card = page.locator('#dm-note-invitations-banner .dm-invitation-card');
    await expect(card).toHaveCount(1);

    // Click dismiss
    const dismissBtn = card.locator('[data-note-dismiss-id]');
    await dismissBtn.click();

    // Card should be removed after animation
    await page.waitForTimeout(300);
    await expect(card).toHaveCount(0);
  });

  test('no banner is shown when there are no pending note invitations', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    // Trigger load with no pending shares
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });
    await page.waitForTimeout(500);

    const banner = page.locator('#dm-note-invitations-banner');
    // Banner should be empty (no cards)
    const cards = banner.locator('.dm-invitation-card');
    await expect(cards).toHaveCount(0);
  });

  test('accepted shares do not appear in invitation banner', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    // Seed an already-accepted share
    const share = makeNoteShare(NOTE_ID, MOCK_USER.uid, {
      noteTitle: 'Already Accepted Note',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedNoteShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const cards = page.locator('#dm-note-invitations-banner .dm-invitation-card');
    await expect(cards).toHaveCount(0);
  });

  test('multiple pending invitations render multiple cards', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share1 = makeNoteShare('ns-multi-1', MOCK_USER.uid, {
      noteTitle: 'First Shared Note',
      ownerId: 'owner-a',
      ownerName: 'Alice',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    const share2 = makeNoteShare('ns-multi-2', MOCK_USER.uid, {
      noteTitle: 'Second Shared Note',
      ownerId: 'owner-b',
      ownerName: 'Bob',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedNoteShare(page, share1);
    await seedNoteShare(page, share2);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-note-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const cards = page.locator('#dm-note-invitations-banner .dm-invitation-card');
    await expect(cards).toHaveCount(2);

    // Clean up extra shares
    await cleanupData(page, ['ns-multi-1', 'ns-multi-2'], [share1.id, share2.id]);
  });
});

test.describe('Note Sharing — IDB Schema', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
  });

  test('noteShares object store exists in IDB', async ({ page }) => {
    const hasStore = await page.evaluate(({ dbName, dbVersion }) => {
      return new Promise<boolean>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const has = db.objectStoreNames.contains('noteShares');
          db.close();
          resolve(has);
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    }, { dbName: DB_NAME, dbVersion: DB_VERSION });

    expect(hasStore).toBe(true);
  });

  test('noteShares store has required indexes', async ({ page }) => {
    const indexes = await page.evaluate(({ dbName, dbVersion }) => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('noteShares', 'readonly');
          const store = tx.objectStore('noteShares');
          const names: string[] = [];
          for (let i = 0; i < store.indexNames.length; i++) {
            names.push(store.indexNames[i]);
          }
          db.close();
          resolve(names.sort());
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    }, { dbName: DB_NAME, dbVersion: DB_VERSION });

    expect(indexes).toContain('noteId');
    expect(indexes).toContain('ownerId');
    expect(indexes).toContain('inviteeEmail');
    expect(indexes).toContain('status');
  });

  test('note serialization includes collaborators field', async ({ page }) => {
    const note = makeNote('ns-collab-field', 'Collab Field Test', MOCK_USER.uid, {
      collaborators: [MOCK_USER.uid, 'other-uid'],
    });
    await seedNote(page, note);

    const stored = await page.evaluate((noteId) => {
      return (window as any).dmSync.getNote(noteId);
    }, 'ns-collab-field');

    expect(stored).toBeTruthy();
    expect(stored.collaborators).toEqual([MOCK_USER.uid, 'other-uid']);

    await cleanupData(page, ['ns-collab-field'], []);
  });

  test('noteShare can be written and read from IDB', async ({ page }) => {
    const share = makeNoteShare('ns-idb-rw', MOCK_COLLABORATOR.uid, {
      noteTitle: 'IDB Read Write',
    });
    await seedNoteShare(page, share);

    const result = await getNoteShareFromIdb(page, share.id);
    expect(result).toBeTruthy();
    expect(result.id).toBe(share.id);
    expect(result.noteId).toBe('ns-idb-rw');
    expect(result.noteTitle).toBe('IDB Read Write');
    expect(result.inviteeUid).toBe(MOCK_COLLABORATOR.uid);

    await cleanupData(page, ['ns-idb-rw'], [share.id]);
  });
});

test.describe('Note Sharing — Public API Surface', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
  });

  test('dmSync exposes all note sharing methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const sync = (window as any).dmSync;
      return {
        shareNote: typeof sync.shareNote,
        acceptNoteShare: typeof sync.acceptNoteShare,
        declineNoteShare: typeof sync.declineNoteShare,
        unshareNote: typeof sync.unshareNote,
        getSharesForNote: typeof sync.getSharesForNote,
        getPendingNoteInvites: typeof sync.getPendingNoteInvites,
        getMyNoteShares: typeof sync.getMyNoteShares,
      };
    });

    expect(methods.shareNote).toBe('function');
    expect(methods.acceptNoteShare).toBe('function');
    expect(methods.declineNoteShare).toBe('function');
    expect(methods.unshareNote).toBe('function');
    expect(methods.getSharesForNote).toBe('function');
    expect(methods.getPendingNoteInvites).toBe('function');
    expect(methods.getMyNoteShares).toBe('function');
  });
});
