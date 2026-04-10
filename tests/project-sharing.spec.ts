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

function makeProject(id: string, name: string, userId: string, opts: Record<string, any> = {}) {
  return {
    id,
    name,
    color: opts.color || '#e8f5e9',
    description: opts.description || '',
    deadline: opts.deadline || null,
    archived: opts.archived || false,
    order: opts.order || 0,
    userId,
    collaborators: opts.collaborators || [userId],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...opts,
  };
}

function makeProjectShare(
  projectId: string,
  inviteeUid: string,
  opts: Record<string, any> = {}
) {
  const shareId = projectId + '_' + inviteeUid;
  return {
    id: shareId,
    projectId,
    projectName: opts.projectName || 'Shared Project',
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

function injectMockAuth(page: Page, user: typeof MOCK_USER) {
  return page.addInitScript((u) => {
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

/** Seed a project directly into IDB. */
async function seedProject(page: Page, project: Record<string, any>) {
  await page.evaluate(
    ({ project, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put(project);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { project, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Seed a projectShare directly into IDB. */
async function seedProjectShare(page: Page, share: Record<string, any>) {
  await page.evaluate(
    ({ share, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projectShares', 'readwrite');
          tx.objectStore('projectShares').put(share);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { share, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Read a projectShare from IDB by ID. */
async function getProjectShareFromIdb(page: Page, shareId: string) {
  return page.evaluate(
    ({ shareId, dbName, dbVersion }) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projectShares', 'readonly');
          const getReq = tx.objectStore('projectShares').get(shareId);
          getReq.onsuccess = () => { db.close(); resolve(getReq.result || null); };
          getReq.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { shareId, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Read all projectShares from IDB. */
async function getAllProjectSharesFromIdb(page: Page) {
  return page.evaluate(
    ({ dbName, dbVersion }) => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projectShares', 'readonly');
          const getAll = tx.objectStore('projectShares').getAll();
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
async function cleanupData(page: Page, projectIds: string[], shareIds: string[]) {
  await page.evaluate(
    ({ projectIds, shareIds, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['projects', 'projectShares'], 'readwrite');
          const projectStore = tx.objectStore('projects');
          const shareStore = tx.objectStore('projectShares');
          projectIds.forEach((id: string) => projectStore.delete(id));
          shareIds.forEach((id: string) => shareStore.delete(id));
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { projectIds, shareIds, dbName: DB_NAME, dbVersion: DB_VERSION }
  );
}

/** Wait for dmSync to be fully available with project sharing methods. */
async function waitForDmSync(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).dmSync && !!(window as any).dmSync.getProject && !!(window as any).dmSync.getSharesForProject,
    { timeout: 10000 }
  );
}

/** Wait for the _pjTest test API to be available. */
async function waitForPjTest(page: Page) {
  await page.waitForFunction(
    () => !!(window as any)._pjTest && !!(window as any)._pjTest.openModal,
    { timeout: 10000 }
  );
}

// ═══════════════════════════════════════
// Tests
// ═══════════════════════════════════════

test.describe('Project Sharing — Data Layer', () => {
  const PROJECT_ID = 'ps-test-proj-1';
  const PROJECT = makeProject(PROJECT_ID, 'Test Sharing Project', MOCK_USER.uid);
  const SHARE_ID = PROJECT_ID + '_' + MOCK_COLLABORATOR.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
    await seedProject(page, PROJECT);
  });

  test.afterEach(async ({ page }) => {
    await cleanupData(page, [PROJECT_ID], [SHARE_ID]);
  });

  test('getSharesForProject returns empty array when no shares exist', async ({ page }) => {
    const shares = await page.evaluate((projectId) => {
      return (window as any).dmSync.getSharesForProject(projectId);
    }, PROJECT_ID);

    expect(shares).toEqual([]);
  });

  test('seeded share is retrievable via getSharesForProject', async ({ page }) => {
    const share = makeProjectShare(PROJECT_ID, MOCK_COLLABORATOR.uid, {
      projectName: PROJECT.name,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    const shares = await page.evaluate((projectId) => {
      return (window as any).dmSync.getSharesForProject(projectId);
    }, PROJECT_ID);

    expect(shares).toHaveLength(1);
    expect(shares[0].id).toBe(SHARE_ID);
    expect(shares[0].projectId).toBe(PROJECT_ID);
    expect(shares[0].inviteeEmail).toBe(MOCK_COLLABORATOR.email);
    expect(shares[0].status).toBe('pending');
  });

  test('getPendingProjectInvites returns pending shares for current user as invitee', async ({ page }) => {
    const share = makeProjectShare('ps-other-proj', MOCK_USER.uid, {
      projectName: 'Someone Else Project',
      ownerId: 'other-owner-uid',
      ownerEmail: 'other@example.com',
      ownerName: 'Other Owner',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    const invites = await page.evaluate(() => {
      return (window as any).dmSync.getPendingProjectInvites();
    });

    expect(invites.length).toBeGreaterThanOrEqual(1);
    const found = invites.find((inv: any) => inv.id === share.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe('pending');
    expect(found.projectName).toBe('Someone Else Project');

    await cleanupData(page, ['ps-other-proj'], [share.id]);
  });

  test('getPendingProjectInvites excludes accepted shares', async ({ page }) => {
    const share = makeProjectShare('ps-accepted-proj', MOCK_USER.uid, {
      projectName: 'Already Accepted',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedProjectShare(page, share);

    const invites = await page.evaluate(() => {
      return (window as any).dmSync.getPendingProjectInvites();
    });

    const found = invites.find((inv: any) => inv.id === share.id);
    expect(found).toBeFalsy();

    await cleanupData(page, ['ps-accepted-proj'], [share.id]);
  });

  test('getMyProjectShares returns shares owned by current user', async ({ page }) => {
    const share = makeProjectShare(PROJECT_ID, MOCK_COLLABORATOR.uid, {
      projectName: PROJECT.name,
      ownerId: MOCK_USER.uid,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    const myShares = await page.evaluate(() => {
      return (window as any).dmSync.getMyProjectShares();
    });

    expect(myShares.length).toBeGreaterThanOrEqual(1);
    const found = myShares.find((s: any) => s.id === SHARE_ID);
    expect(found).toBeTruthy();
    expect(found.ownerId).toBe(MOCK_USER.uid);
  });
});

test.describe('Project Sharing — Edit Modal UI', () => {
  const PROJECT_ID = 'ps-modal-proj-1';
  const PROJECT = makeProject(PROJECT_ID, 'Modal Sharing Project', MOCK_USER.uid);
  const SHARE_ID = PROJECT_ID + '_' + MOCK_COLLABORATOR.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/projects/');
    await waitForDmSync(page);
    await waitForPjTest(page);
    await seedProject(page, PROJECT);
    // Set the project in the test API so openModal can find it
    await page.evaluate((proj) => {
      (window as any)._pjTest.setProjects([proj]);
    }, PROJECT);
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      (window as any)._pjTest.closeModal();
    });
    await cleanupData(page, [PROJECT_ID], [SHARE_ID]);
  });

  test('sharing section is visible when owner opens edit modal', async ({ page }) => {
    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    const sharingSection = page.locator('#project-share-section');
    await expect(sharingSection).toBeVisible();

    const shareControls = page.locator('#project-share-controls');
    await expect(shareControls).toBeVisible();

    const ownerInfo = page.locator('#project-share-owner-info');
    await expect(ownerInfo).not.toBeVisible();
  });

  test('sharing section shows email input and share button for owner', async ({ page }) => {
    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    const emailInput = page.locator('#project-share-email');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'Enter email to share...');

    const sendBtn = page.locator('#project-share-send');
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toHaveText('Share');
  });

  test('sharing section shows "Not shared with anyone" when no shares exist', async ({ page }) => {
    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(300);

    const shareList = page.locator('#project-share-list');
    await expect(shareList).toContainText('Not shared with anyone');
  });

  test('share list displays existing collaborators with status', async ({ page }) => {
    const share = makeProjectShare(PROJECT_ID, MOCK_COLLABORATOR.uid, {
      projectName: PROJECT.name,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(500);

    const shareItem = page.locator('.project-share-item');
    await expect(shareItem).toHaveCount(1);

    const itemEmail = shareItem.locator('.project-share-item-email');
    await expect(itemEmail).toContainText(MOCK_COLLABORATOR.email);

    const itemStatus = shareItem.locator('.project-share-item-status');
    await expect(itemStatus).toContainText('pending');
    await expect(itemStatus).toHaveClass(/status-pending/);
  });

  test('share list shows accepted status for accepted shares', async ({ page }) => {
    const share = makeProjectShare(PROJECT_ID, MOCK_COLLABORATOR.uid, {
      projectName: PROJECT.name,
      status: 'accepted',
    });
    await seedProjectShare(page, share);

    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(500);

    const itemStatus = page.locator('.project-share-item-status');
    await expect(itemStatus).toContainText('accepted');
    await expect(itemStatus).toHaveClass(/status-accepted/);
  });

  test('remove button is visible on share list items', async ({ page }) => {
    const share = makeProjectShare(PROJECT_ID, MOCK_COLLABORATOR.uid, {
      projectName: PROJECT.name,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(500);

    const removeBtn = page.locator('.project-share-item-remove');
    await expect(removeBtn).toHaveCount(1);
    await expect(removeBtn).toHaveAttribute('data-proj-unshare-id', SHARE_ID);
  });

  test('collaborator view shows owner info and hides share controls', async ({ page }) => {
    const collabProject = makeProject(PROJECT_ID, 'Collab View Project', 'other-owner-uid', {
      collaborators: ['other-owner-uid', MOCK_USER.uid],
    });

    const share = makeProjectShare(PROJECT_ID, MOCK_USER.uid, {
      projectName: collabProject.name,
      ownerId: 'other-owner-uid',
      ownerEmail: 'other@example.com',
      ownerName: 'Other Owner',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedProject(page, collabProject);
    await seedProjectShare(page, share);

    await page.evaluate((proj) => {
      (window as any)._pjTest.setProjects([proj]);
    }, collabProject);

    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(500);

    const shareControls = page.locator('#project-share-controls');
    await expect(shareControls).not.toBeVisible();

    const ownerInfo = page.locator('#project-share-owner-info');
    await expect(ownerInfo).toBeVisible();
    await expect(ownerInfo).toContainText('Other Owner');

    await cleanupData(page, [], [share.id]);
  });

  test('sharing section is hidden in create mode', async ({ page }) => {
    // Open modal with no projectId = create mode
    await page.evaluate(() => {
      (window as any)._pjTest.openModal(null);
    });

    const sharingSection = page.locator('#project-share-section');
    await expect(sharingSection).not.toBeVisible();
  });

  test('closing and reopening modal resets sharing state', async ({ page }) => {
    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(300);
    const sharingSection = page.locator('#project-share-section');
    await expect(sharingSection).toBeVisible();

    await page.evaluate(() => {
      (window as any)._pjTest.closeModal();
    });

    await expect(sharingSection).not.toBeVisible();

    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    await page.waitForTimeout(300);
    await expect(sharingSection).toBeVisible();
    await expect(page.locator('#project-share-list')).toContainText('Not shared with anyone');
  });

  test('sharing section header shows people icon and "Sharing" label', async ({ page }) => {
    await page.evaluate((id) => {
      (window as any)._pjTest.openModal(id);
    }, PROJECT_ID);

    const header = page.locator('.project-share-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Sharing');

    const icon = header.locator('svg');
    await expect(icon).toBeAttached();
  });
});

test.describe('Project Sharing — Invitation Banners', () => {
  const PROJECT_ID = 'ps-invite-proj-1';
  const SHARE_ID = PROJECT_ID + '_' + MOCK_USER.uid;

  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
  });

  test.afterEach(async ({ page }) => {
    await cleanupData(page, [PROJECT_ID], [SHARE_ID]);
  });

  test('pending project invitation renders a banner card', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeProjectShare(PROJECT_ID, MOCK_USER.uid, {
      projectName: 'Invited Project Title',
      ownerId: 'other-owner-uid',
      ownerEmail: 'sharer@example.com',
      ownerName: 'Sharer Person',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });

    await page.waitForTimeout(1000);

    const banner = page.locator('#dm-project-invitations-banner');
    const card = banner.locator('.dm-invitation-card');
    await expect(card).toHaveCount(1);

    const header = card.locator('.dm-invitation-header');
    await expect(header).toContainText('Project Shared With You');

    const body = card.locator('.dm-invitation-body');
    await expect(body).toContainText('Sharer Person');
    await expect(body).toContainText('shared a project');
    await expect(body).toContainText('Invited Project Title');
  });

  test('accept and decline buttons are present on invitation card', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeProjectShare(PROJECT_ID, MOCK_USER.uid, {
      projectName: 'Buttons Test Project',
      ownerId: 'other-owner-uid',
      ownerEmail: 'sharer@example.com',
      ownerName: 'Sharer',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const card = page.locator('#dm-project-invitations-banner .dm-invitation-card');
    const acceptBtn = card.locator('[data-project-accept-id]');
    const declineBtn = card.locator('[data-project-decline-id]');

    await expect(acceptBtn).toHaveCount(1);
    await expect(acceptBtn).toHaveText('Accept');
    await expect(declineBtn).toHaveCount(1);
    await expect(declineBtn).toHaveText('Decline');
  });

  test('dismiss button removes invitation card with animation', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeProjectShare(PROJECT_ID, MOCK_USER.uid, {
      projectName: 'Dismiss Test',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedProjectShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const card = page.locator('#dm-project-invitations-banner .dm-invitation-card');
    await expect(card).toHaveCount(1);

    const dismissBtn = card.locator('[data-project-dismiss-id]');
    await dismissBtn.click();

    await page.waitForTimeout(300);
    await expect(card).toHaveCount(0);
  });

  test('no banner is shown when there are no pending project invitations', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });
    await page.waitForTimeout(500);

    const banner = page.locator('#dm-project-invitations-banner');
    const cards = banner.locator('.dm-invitation-card');
    await expect(cards).toHaveCount(0);
  });

  test('accepted shares do not appear in invitation banner', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share = makeProjectShare(PROJECT_ID, MOCK_USER.uid, {
      projectName: 'Already Accepted Project',
      ownerId: 'other-owner-uid',
      inviteeEmail: MOCK_USER.email,
      status: 'accepted',
    });
    await seedProjectShare(page, share);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const cards = page.locator('#dm-project-invitations-banner .dm-invitation-card');
    await expect(cards).toHaveCount(0);
  });

  test('multiple pending invitations render multiple cards', async ({ page }) => {
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);

    const share1 = makeProjectShare('ps-multi-1', MOCK_USER.uid, {
      projectName: 'First Shared Project',
      ownerId: 'owner-a',
      ownerName: 'Alice',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    const share2 = makeProjectShare('ps-multi-2', MOCK_USER.uid, {
      projectName: 'Second Shared Project',
      ownerId: 'owner-b',
      ownerName: 'Bob',
      inviteeEmail: MOCK_USER.email,
      status: 'pending',
    });
    await seedProjectShare(page, share1);
    await seedProjectShare(page, share2);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('dm-project-shares-updated'));
    });
    await page.waitForTimeout(1000);

    const cards = page.locator('#dm-project-invitations-banner .dm-invitation-card');
    await expect(cards).toHaveCount(2);

    await cleanupData(page, ['ps-multi-1', 'ps-multi-2'], [share1.id, share2.id]);
  });
});

test.describe('Project Sharing — IDB Schema', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
  });

  test('projectShares object store exists in IDB', async ({ page }) => {
    const hasStore = await page.evaluate(({ dbName, dbVersion }) => {
      return new Promise<boolean>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const has = db.objectStoreNames.contains('projectShares');
          db.close();
          resolve(has);
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    }, { dbName: DB_NAME, dbVersion: DB_VERSION });

    expect(hasStore).toBe(true);
  });

  test('projectShares store has required indexes', async ({ page }) => {
    const indexes = await page.evaluate(({ dbName, dbVersion }) => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('projectShares', 'readonly');
          const store = tx.objectStore('projectShares');
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

    expect(indexes).toContain('projectId');
    expect(indexes).toContain('ownerId');
    expect(indexes).toContain('inviteeEmail');
    expect(indexes).toContain('status');
  });

  test('project serialization includes collaborators field', async ({ page }) => {
    const project = makeProject('ps-collab-field', 'Collab Field Test', MOCK_USER.uid, {
      collaborators: [MOCK_USER.uid, 'other-uid'],
    });
    await seedProject(page, project);

    const stored = await page.evaluate((projectId) => {
      return (window as any).dmSync.getProject(projectId);
    }, 'ps-collab-field');

    expect(stored).toBeTruthy();
    expect(stored.collaborators).toEqual([MOCK_USER.uid, 'other-uid']);

    await cleanupData(page, ['ps-collab-field'], []);
  });

  test('projectShare can be written and read from IDB', async ({ page }) => {
    const share = makeProjectShare('ps-idb-rw', MOCK_COLLABORATOR.uid, {
      projectName: 'IDB Read Write',
    });
    await seedProjectShare(page, share);

    const result = await getProjectShareFromIdb(page, share.id);
    expect(result).toBeTruthy();
    expect(result.id).toBe(share.id);
    expect(result.projectId).toBe('ps-idb-rw');
    expect(result.projectName).toBe('IDB Read Write');
    expect(result.inviteeUid).toBe(MOCK_COLLABORATOR.uid);

    await cleanupData(page, ['ps-idb-rw'], [share.id]);
  });
});

test.describe('Project Sharing — Public API Surface', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
    await page.goto('./docs/inbox/');
    await waitForDmSync(page);
  });

  test('dmSync exposes all project sharing methods', async ({ page }) => {
    const methods = await page.evaluate(() => {
      const sync = (window as any).dmSync;
      return {
        shareProject: typeof sync.shareProject,
        acceptProjectShare: typeof sync.acceptProjectShare,
        declineProjectShare: typeof sync.declineProjectShare,
        unshareProject: typeof sync.unshareProject,
        getSharesForProject: typeof sync.getSharesForProject,
        getPendingProjectInvites: typeof sync.getPendingProjectInvites,
        getMyProjectShares: typeof sync.getMyProjectShares,
      };
    });

    expect(methods.shareProject).toBe('function');
    expect(methods.acceptProjectShare).toBe('function');
    expect(methods.declineProjectShare).toBe('function');
    expect(methods.unshareProject).toBe('function');
    expect(methods.getSharesForProject).toBe('function');
    expect(methods.getPendingProjectInvites).toBe('function');
    expect(methods.getMyProjectShares).toBe('function');
  });
});
