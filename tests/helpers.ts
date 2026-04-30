/**
 * Shared test helpers for Digital Memory Playwright specs.
 *
 * Single source of truth for:
 *  - IDB constants (DB_NAME, DB_VERSION)
 *  - Mock user objects
 *  - injectMockAuth() — full Firebase Auth mock via addInitScript
 *  - Generic IDB seed / cleanup / read helpers
 *  - Data-object factories (makeNote, makeTodo, makeProject, makeShare, …)
 *  - waitForDmSync()
 */

import { Page } from '@playwright/test';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const DB_NAME = 'dm-notes';
export const DB_VERSION = 21;

// ─────────────────────────────────────────────
// Mock users
// ─────────────────────────────────────────────

export const MOCK_USER = {
  uid: 'test-user-owner',
  displayName: 'Owner User',
  email: 'owner@example.com',
  photoURL: 'https://example.com/owner.png',
};

export const MOCK_COLLABORATOR = {
  uid: 'test-user-collab',
  displayName: 'Collab User',
  email: 'collab@example.com',
  photoURL: 'https://example.com/collab.png',
};

// Legacy alias used by auth-persistence.spec.ts
export const MOCK_FIREBASE_USER = {
  uid: 'test-uid-123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/avatar.png',
};

// ─────────────────────────────────────────────
// Demo mode opt-out
// ─────────────────────────────────────────────

/**
 * Disable demo mode for the page. Demo mode (dm-demo.html) populates 16 IDB
 * stores with curated fixtures (8 review cards, kanban data, garden sections,
 * etc.) when no `dm-cached-user` is in localStorage and `dm-demo-disabled` is
 * not set. That breaks tests which assume signed-out = empty state, or which
 * seed their own fixtures via raw IDB writes (demo mode intercepts reads).
 *
 * Call this BEFORE `page.goto()`. Idempotent — safe to call multiple times.
 */
export function disableDemoMode(page: Page) {
  return page.addInitScript(() => {
    try { localStorage.setItem('dm-demo-disabled', '1'); } catch (e) {}
  });
}

// ─────────────────────────────────────────────
// Auth mock
// ─────────────────────────────────────────────

/**
 * Inject a fully-controllable mock Firebase Auth into the page before load.
 *
 * Replaces `window.dmAuth` with a mock that:
 *  - tracks `currentUser` via `_mockAuthCurrentUser`
 *  - supports `onAuthStateChanged`, `signOut`, `signInWithCredential`
 *  - exposes `window._mockAuthEmit(user)` to trigger state changes from tests
 *
 * Also replaces `dmSignIn` and `dmRegisterUser` with no-ops so pages don't
 * try to open a popup.
 *
 * Pass `null` as `user` to simulate a signed-out state.
 */
export function injectMockAuth(page: Page, user: typeof MOCK_USER | null) {
  // Always disable demo mode in mock-auth tests — demo fixtures interfere
  // with both signed-in and signed-out test expectations.
  disableDemoMode(page);
  return page.addInitScript((u) => {
    // Pre-populate cached user in localStorage (mirrors real auth flow)
    if (u) {
      localStorage.setItem('dm-cached-user', JSON.stringify({
        displayName: u.displayName || '',
        email: u.email || '',
        photoURL: u.photoURL || '',
      }));
    } else {
      localStorage.removeItem('dm-cached-user');
    }

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
      const subs = (window as any)._mockAuthSubscribers as Array<(u: any) => void>;
      for (let i = 0; i < subs.length; i++) subs[i](newUser);
    };

    const mockAuth = {
      get currentUser() { return (window as any)._mockAuthCurrentUser; },
      onAuthStateChanged(callback: (user: any) => void) {
        (window as any)._mockAuthSubscribers.push(callback);
        const cur = (window as any)._mockAuthCurrentUser;
        setTimeout(() => callback(cur), 0);
        return () => {
          const subs = (window as any)._mockAuthSubscribers as any[];
          const idx = subs.indexOf(callback);
          if (idx >= 0) subs.splice(idx, 1);
        };
      },
      signOut() {
        (window as any)._mockAuthEmit(null);
        return Promise.resolve();
      },
      signInWithCredential() {
        (window as any)._mockAuthEmit(u);
        return Promise.resolve({ user: u });
      },
      signInWithPopup() { return Promise.resolve({ user: null }); },
      signInWithRedirect() { return Promise.resolve(); },
      getRedirectResult() { return Promise.resolve(null); },
    };

    Object.defineProperty(window, 'dmAuth', {
      get() { return mockAuth; },
      set() {},
      configurable: true,
    });

    // Keep dmDb as null so syncTodos/syncNotes/syncProjects bail out immediately
    // at their `if (!window.dmDb) return Promise.reject(...)` guard.
    // Without this, the Firebase SDK sets dmDb and syncAll() runs Firestore
    // queries that return empty snapshots, causing syncTodos() to delete every
    // local-only IDB fixture seeded by tests (line 1036 of dm-sync.html).
    Object.defineProperty(window, 'dmDb', {
      get() { return null; },
      set() {},   // swallow Firebase SDK's assignment
      configurable: true,
    });

    Object.defineProperty(window, 'dmSignIn', {
      get() { return () => mockAuth.signInWithCredential(); },
      set() {},
      configurable: true,
    });

    Object.defineProperty(window, 'dmRegisterUser', {
      get() { return () => {}; },
      set() {},
      configurable: true,
    });
  }, user);
}

// ─────────────────────────────────────────────
// Generic IDB helpers
// ─────────────────────────────────────────────

/** Write one or more records into an IDB object store. */
export async function seedIdb(
  page: Page,
  storeName: string,
  records: Record<string, any>[],
): Promise<void> {
  await page.evaluate(
    ({ storeName, records, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          records.forEach((r: any) => store.put(r));
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { storeName, records, dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

/** Delete records by key from an IDB object store. */
export async function cleanupIdb(
  page: Page,
  storeName: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  await page.evaluate(
    ({ storeName, ids, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          ids.forEach((id: string) => store.delete(id));
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { storeName, ids, dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

/** Read a single record from an IDB object store by key. */
export async function getIdbRecord(
  page: Page,
  storeName: string,
  id: string,
): Promise<any> {
  return page.evaluate(
    ({ storeName, id, dbName, dbVersion }) => {
      return new Promise<any>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const getReq = tx.objectStore(storeName).get(id);
          getReq.onsuccess = () => { db.close(); resolve(getReq.result || null); };
          getReq.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { storeName, id, dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

/** Read all records from an IDB object store. */
export async function getAllIdbRecords(
  page: Page,
  storeName: string,
): Promise<any[]> {
  return page.evaluate(
    ({ storeName, dbName, dbVersion }) => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const getAll = tx.objectStore(storeName).getAll();
          getAll.onsuccess = () => { db.close(); resolve(getAll.result); };
          getAll.onerror = (e: any) => { db.close(); reject(e.target.error); };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { storeName, dbName: DB_NAME, dbVersion: DB_VERSION },
  );
}

// ─────────────────────────────────────────────
// Convenience typed wrappers
// ─────────────────────────────────────────────

export const seedNote = (page: Page, note: Record<string, any>) =>
  seedIdb(page, 'notes', [note]);

export const seedTodo = (page: Page, todo: Record<string, any>) =>
  seedIdb(page, 'todos', [todo]);

export const seedProject = (page: Page, project: Record<string, any>) =>
  seedIdb(page, 'projects', [project]);

export const seedNoteShare = (page: Page, share: Record<string, any>) =>
  seedIdb(page, 'noteShares', [share]);

export const seedProjectShare = (page: Page, share: Record<string, any>) =>
  seedIdb(page, 'projectShares', [share]);

export const seedReviewCard = (page: Page, card: Record<string, any>) =>
  seedIdb(page, 'reviewCards', [card]);

// ─────────────────────────────────────────────
// Factory functions
// ─────────────────────────────────────────────

export function makeNote(
  id: string,
  title: string,
  userId: string,
  opts: Record<string, any> = {},
) {
  return {
    id,
    title,
    content: opts.content ?? `Test note content for ${title}`,
    mode: opts.mode ?? 'note',
    destination: opts.destination ?? 'inbox',
    language: opts.language ?? null,
    bookTitle: opts.bookTitle ?? null,
    tags: opts.tags ?? [],
    userId,
    userEmail: opts.userEmail ?? MOCK_USER.email,
    userName: opts.userName ?? MOCK_USER.displayName,
    pinned: opts.pinned ?? false,
    collaborators: opts.collaborators ?? [userId],
    deletedAt: opts.deletedAt ?? null,
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    ...opts,
  };
}

export function makeTodo(
  id: string,
  title: string,
  userId: string,
  opts: Record<string, any> = {},
) {
  return {
    id,
    title,
    userId,
    estimatedMin: opts.estimatedMin ?? 25,
    actualMin: opts.actualMin ?? 0,
    category: opts.category ?? null,
    pomodoroCount: opts.pomodoroCount ?? 1,
    pomodoroLength: opts.pomodoroLength ?? 25,
    breakLength: opts.breakLength ?? 5,
    projectId: opts.projectId ?? null,
    done: opts.done ?? false,
    status: opts.status ?? 'active',
    parentId: opts.parentId ?? null,
    order: opts.order ?? 1000,
    scheduledDate: opts.scheduledDate ?? new Date().toISOString().slice(0, 10),
    reminderAt: opts.reminderAt ?? null,
    reminderFired: opts.reminderFired ?? false,
    source: opts.source ?? null,
    bujoType: opts.bujoType ?? 'task',
    bujoState: opts.bujoState ?? 'open',
    kanbanStatus: opts.kanbanStatus ?? 'todo',
    kanbanOrder: opts.kanbanOrder ?? 1000,
    collaborators: opts.collaborators ?? [],
    notes: opts.notes ?? '',
    color: opts.color ?? null,
    color2: opts.color2 ?? null,
    deletedAt: opts.deletedAt ?? null,
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    completedAt: opts.completedAt ?? null,
    ...opts,
  };
}

export function makeProject(
  id: string,
  name: string,
  userId: string,
  opts: Record<string, any> = {},
) {
  return {
    id,
    name,
    color: opts.color ?? '#e8f5e9',
    description: opts.description ?? '',
    deadline: opts.deadline ?? null,
    archived: opts.archived ?? false,
    order: opts.order ?? 0,
    userId,
    collaborators: opts.collaborators ?? [userId],
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    ...opts,
  };
}

export function makeNoteShare(
  noteId: string,
  inviteeUid: string,
  opts: Record<string, any> = {},
) {
  const shareId = `${noteId}_${inviteeUid}`;
  return {
    id: shareId,
    noteId,
    noteTitle: opts.noteTitle ?? 'Shared Note',
    ownerId: opts.ownerId ?? MOCK_USER.uid,
    ownerEmail: opts.ownerEmail ?? MOCK_USER.email,
    ownerName: opts.ownerName ?? MOCK_USER.displayName,
    inviteeEmail: opts.inviteeEmail ?? MOCK_COLLABORATOR.email,
    inviteeUid,
    status: opts.status ?? 'pending',
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    ...opts,
  };
}

export function makeProjectShare(
  projectId: string,
  inviteeUid: string,
  opts: Record<string, any> = {},
) {
  const shareId = `${projectId}_${inviteeUid}`;
  return {
    id: shareId,
    projectId,
    projectName: opts.projectName ?? 'Shared Project',
    ownerId: opts.ownerId ?? MOCK_USER.uid,
    ownerEmail: opts.ownerEmail ?? MOCK_USER.email,
    ownerName: opts.ownerName ?? MOCK_USER.displayName,
    inviteeEmail: opts.inviteeEmail ?? MOCK_COLLABORATOR.email,
    inviteeUid,
    status: opts.status ?? 'pending',
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    ...opts,
  };
}

export function makeReviewCard(
  id: string,
  front: string,
  back: string,
  opts: Record<string, any> = {},
) {
  return {
    id,
    front,
    back,
    tags: opts.tags ?? [],
    userId: opts.userId ?? MOCK_USER.uid,
    easeFactor: opts.easeFactor ?? 2.5,
    interval: opts.interval ?? 0,
    repetitions: opts.repetitions ?? 0,
    nextReviewAt: opts.nextReviewAt ?? Date.now() - 1000,
    lastReviewedAt: opts.lastReviewedAt ?? null,
    createdAt: opts.createdAt ?? Date.now(),
    updatedAt: opts.updatedAt ?? Date.now(),
    ...opts,
  };
}

// ─────────────────────────────────────────────
// Wait helpers
// ─────────────────────────────────────────────

/** Wait until window.dmSync (and key methods) are available. */
export async function waitForDmSync(page: Page, timeout = 15_000) {
  await page.waitForFunction(
    () => !!(window as any).dmSync && typeof (window as any).dmSync.putNote === 'function',
    { timeout },
  );
  // Dispatch dm-sync-complete on window so auth-gated UI components
  // (todo-list, kanban, trash, etc.) render from IDB data.
  // In tests there is no real Firestore so dm-sync.html's syncAll() never
  // dispatches this event itself (it only fires on success or quota errors).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dm-sync-complete'));
  });
  // Wait for dm-sync.html's handleSyncAuth to finish its IDB setup.
  // handleSyncAuth reads META.currentUserId and — on a fresh context where
  // it's null — clears all IDB stores before writing the new userId.
  // We must let this complete before any test seeds data, otherwise the
  // clear races with the seed and wipes our test fixtures.
  await page.waitForFunction(() => {
    return new Promise<boolean>((resolve) => {
      try {
        const req = indexedDB.open('dm-notes');
        req.onsuccess = () => {
          const db = req.result as IDBDatabase;
          try {
            const tx = db.transaction('meta', 'readonly');
            const r = tx.objectStore('meta').get('currentUserId');
            r.onsuccess = () => { db.close(); resolve(!!r.result); };
            r.onerror  = () => { db.close(); resolve(false); };
          } catch (e) { db.close(); resolve(false); }
        };
        req.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }, { timeout });
}
