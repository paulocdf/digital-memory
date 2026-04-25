import { test, expect, Page } from '@playwright/test';
import { MOCK_USER, injectMockAuth, waitForDmSync } from './helpers';

// Currency preference syncs to Firestore userSettings/{uid}.budgetCurrency
// so it follows the user across devices. localStorage stays as the warm
// cache for synchronous reads.
//
// Note: helpers.ts forces window.dmDb to null. firestoreWrite() therefore
// queues writes to the IDB writeQueue store rather than calling Firestore
// directly. We verify the queued payload to assert intent.

async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).dmBudget && typeof (window as any).dmBudget.setCurrency === 'function',
    { timeout: 10_000 },
  );
}

async function readWriteQueue(page: Page) {
  return page.evaluate(async () => {
    return await new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open('dm-notes', 20);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('writeQueue', 'readonly');
        const getAll = tx.objectStore('writeQueue').getAll();
        getAll.onsuccess = () => {
          db.close();
          resolve(getAll.result || []);
        };
        getAll.onerror = () => {
          db.close();
          reject(getAll.error);
        };
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function clearWriteQueue(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('dm-notes', 20);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('writeQueue', 'readwrite');
        tx.objectStore('writeQueue').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  });
}

async function setup(page: Page) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/budget/');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await page.evaluate(() => {
    localStorage.removeItem('dm-budget-local-only');
    localStorage.removeItem('dm-budget-currency');
  });
  await clearWriteQueue(page);
}

test.describe('Budget currency sync', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('setCurrency writes to localStorage', async ({ page }) => {
    await page.evaluate(() => (window as any).dmBudget.setCurrency('EUR'));
    const stored = await page.evaluate(() => localStorage.getItem('dm-budget-currency'));
    expect(stored).toBe('EUR');
    const live = await page.evaluate(() => (window as any).dmBudget.getCurrency());
    expect(live).toBe('EUR');
  });

  test('setCurrency queues a Firestore write to userSettings/{uid}', async ({ page }) => {
    await page.evaluate(() => (window as any).dmBudget.setCurrency('EUR'));
    // Allow firestoreWrite() chain to enqueue
    await page.waitForTimeout(300);
    const queue = await readWriteQueue(page);
    const settingsWrites = queue.filter((q) =>
      q.collection === 'userSettings' && q.docId === MOCK_USER.uid,
    );
    expect(settingsWrites.length).toBeGreaterThan(0);
    const w = settingsWrites[settingsWrites.length - 1];
    expect(w.op).toBe('set');
    expect(w.merge).toBe(true);
    expect(w.data && w.data.budgetCurrency).toBe('EUR');
  });

  test('setCurrency dispatches dm-budget-updated event', async ({ page }) => {
    const fired = await page.evaluate(() =>
      new Promise<boolean>((resolve) => {
        const handler = () => { window.removeEventListener('dm-budget-updated', handler); resolve(true); };
        window.addEventListener('dm-budget-updated', handler);
        (window as any).dmBudget.setCurrency('GBP');
        setTimeout(() => resolve(false), 1000);
      }),
    );
    expect(fired).toBe(true);
  });

  test('setCurrency respects budget local-only mode (no Firestore write)', async ({ page }) => {
    await page.evaluate(() => (window as any).dmBudget.setLocalOnly(true));
    await clearWriteQueue(page);
    await page.evaluate(() => (window as any).dmBudget.setCurrency('JPY'));
    await page.waitForTimeout(150);
    const queue = await readWriteQueue(page);
    const settingsWrites = queue.filter((q) =>
      q.collection === 'userSettings' && q.docId === MOCK_USER.uid,
    );
    expect(settingsWrites.length).toBe(0);
    // localStorage still updated
    const stored = await page.evaluate(() => localStorage.getItem('dm-budget-currency'));
    expect(stored).toBe('JPY');
  });

  test('syncBudgetCurrency is exposed on window.dmSync', async ({ page }) => {
    const exposed = await page.evaluate(
      () => typeof (window as any).dmSync.syncBudgetCurrency === 'function',
    );
    expect(exposed).toBe(true);
  });

  test('syncBudgetCurrency resolves safely when dmDb is null (test mock)', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      try {
        await (window as any).dmSync.syncBudgetCurrency('any-uid');
        return true;
      } catch {
        return false;
      }
    });
    expect(ok).toBe(true);
  });
});
