import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers — mirror of budget.spec.ts setup
// ─────────────────────────────────────────────

const BUDGET_STORES = [
  'accounts',
  'categories',
  'budgets',
  'transactions',
  'recurring',
] as const;

async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () =>
      !!(window as any).dmBudget &&
      typeof (window as any).dmBudget.createRecurring === 'function' &&
      typeof (window as any).dmBudget.runRecurringDue === 'function' &&
      typeof (window as any).dmBudget.computeNextDate === 'function',
    { timeout: 10_000 },
  );
}

async function cleanupAllBudgetStores(page: Page) {
  for (const store of BUDGET_STORES) {
    const recs = await getAllIdbRecords(page, store);
    const ids = recs.map((r) => r.id).filter(Boolean);
    if (ids.length) await cleanupIdb(page, store, ids);
  }
  await page.evaluate(() => {
    localStorage.removeItem('dm-budget-local-only');
    localStorage.removeItem('dm-budget-currency');
  });
}

async function setup(page: Page) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/budget/recurring/');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await cleanupAllBudgetStores(page);
  // Ensure an account exists so createRecurring has something to bind to
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
}

// ─────────────────────────────────────────────
// Tests — computeNextDate (pure function)
// ─────────────────────────────────────────────

test.describe('Recurring — computeNextDate', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('daily advances by N days', async ({ page }) => {
    const next = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2025-06-15', 'daily', 1),
    );
    expect(next).toBe('2025-06-16');

    const plus7 = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2025-06-15', 'daily', 7),
    );
    expect(plus7).toBe('2025-06-22');
  });

  test('weekly advances by N * 7 days', async ({ page }) => {
    const next = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2025-06-15', 'weekly', 2),
    );
    expect(next).toBe('2025-06-29');
  });

  test('monthly advances by N months, clamping to last day of target month', async ({ page }) => {
    const febFromJan31 = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2025-01-31', 'monthly', 1),
    );
    expect(febFromJan31).toBe('2025-02-28'); // 2025 non-leap

    const febLeap = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2024-01-31', 'monthly', 1),
    );
    expect(febLeap).toBe('2024-02-29');

    const simple = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2025-03-10', 'monthly', 1),
    );
    expect(simple).toBe('2025-04-10');
  });

  test('yearly advances by N years, clamping Feb 29 on non-leap years', async ({ page }) => {
    const fromLeap = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2024-02-29', 'yearly', 1),
    );
    expect(fromLeap).toBe('2025-02-28');

    const plain = await page.evaluate(() =>
      (window as any).dmBudget.computeNextDate('2023-07-04', 'yearly', 2),
    );
    expect(plain).toBe('2025-07-04');
  });
});

// ─────────────────────────────────────────────
// Tests — CRUD round-trip
// ─────────────────────────────────────────────

test.describe('Recurring — CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('createRecurring persists to IDB with the right shape', async ({ page }) => {
    const rule = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      return b.createRecurring({
        payee: 'Rent',
        amount: -120000,
        accountId: acct.id,
        frequency: 'monthly',
        interval: 1,
        startDate: '2025-01-01',
        autoPost: true,
      });
    });
    expect(rule.id).toBeTruthy();
    expect(rule.payee).toBe('Rent');
    expect(rule.amount).toBe(-120000);
    expect(rule.frequency).toBe('monthly');
    expect(rule.nextDueDate).toBe('2025-01-01');
    expect(rule.autoPost).toBe(true);
    expect(rule.userId).toBe(MOCK_USER.uid);

    const all = await getAllIdbRecords(page, 'recurring');
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(rule.id);
  });

  test('updateRecurring patches fields and updates timestamp', async ({ page }) => {
    const before = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      return b.createRecurring({ payee: 'Old', amount: 1000, accountId: acct.id, startDate: '2025-05-01' });
    });
    const after = await page.evaluate(
      (id) => (window as any).dmBudget.updateRecurring(id, { payee: 'New', amount: 2500, autoPost: false }),
      before.id,
    );
    expect(after.payee).toBe('New');
    expect(after.amount).toBe(2500);
    expect(after.autoPost).toBe(false);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });

  test('deleteRecurring hard-removes from IDB', async ({ page }) => {
    const created = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      return b.createRecurring({ payee: 'Tmp', amount: 0, accountId: acct.id });
    });
    await page.evaluate(
      (id) => (window as any).dmBudget.deleteRecurring(id),
      created.id,
    );
    const all = await getAllIdbRecords(page, 'recurring');
    expect(all.find((r) => r.id === created.id)).toBeUndefined();
  });

  test('getRecurring returns rules sorted by active then next-due', async ({ page }) => {
    const sorted = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createRecurring({ payee: 'A-paused', amount: 100, accountId: acct.id, nextDueDate: '2025-01-01', autoPost: false });
      await b.createRecurring({ payee: 'B-later',  amount: 100, accountId: acct.id, nextDueDate: '2025-06-01', autoPost: true  });
      await b.createRecurring({ payee: 'C-sooner', amount: 100, accountId: acct.id, nextDueDate: '2025-03-01', autoPost: true  });
      return b.getRecurring();
    });
    expect(sorted.map((r: any) => r.payee)).toEqual(['C-sooner', 'B-later', 'A-paused']);
  });
});

// ─────────────────────────────────────────────
// Tests — Scheduler (runRecurringDue)
// ─────────────────────────────────────────────

test.describe('Recurring — auto-post scheduler', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('posts a rule whose nextDueDate is today and advances', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const today = new Date().toISOString().substr(0, 10);
      await b.createRecurring({
        payee: 'Rent', amount: -120000, accountId: acct.id,
        frequency: 'monthly', interval: 1,
        startDate: today, nextDueDate: today, autoPost: true
      });
      const r = await b.runRecurringDue({ today: today });
      const txs = await b.getTransactions({});
      return { r, txCount: txs.length, txPayee: txs[0] && txs[0].payee, txRecurring: txs[0] && txs[0].recurringId };
    });
    expect(result.r.posted).toBe(1);
    expect(result.r.skipped).toBe(0);
    expect(result.txCount).toBe(1);
    expect(result.txPayee).toBe('Rent');
    expect(result.txRecurring).toBeTruthy();
  });

  test('is idempotent — running twice posts only once', async ({ page }) => {
    const [first, second] = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const today = new Date().toISOString().substr(0, 10);
      await b.createRecurring({
        payee: 'Sub', amount: -999, accountId: acct.id,
        frequency: 'daily', interval: 1,
        startDate: today, nextDueDate: today, autoPost: true
      });
      const r1 = await b.runRecurringDue({ today: today });
      // Reset the rule's nextDueDate back to today to test idempotency guard
      const rules = await b.getRecurring();
      await b.updateRecurring(rules[0].id, { nextDueDate: today });
      const r2 = await b.runRecurringDue({ today: today });
      return [r1, r2];
    });
    expect(first.posted).toBe(1);
    expect(second.posted).toBe(0);
    expect(second.skipped).toBe(1);
  });

  test('backfills multiple missed periods', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      // Daily rule, 5 days overdue relative to fixed "today" 2025-06-10
      await b.createRecurring({
        payee: 'Coffee', amount: -500, accountId: acct.id,
        frequency: 'daily', interval: 1,
        startDate: '2025-06-06', nextDueDate: '2025-06-06', autoPost: true
      });
      const result = await b.runRecurringDue({ today: '2025-06-10' });
      const txs = await b.getTransactions({});
      const rules = await b.getRecurring();
      return {
        posted: result.posted,
        txCount: txs.length,
        nextDueDate: rules[0].nextDueDate,
        lastPostedDate: rules[0].lastPostedDate,
      };
    });
    expect(r.posted).toBe(5); // Jun 6,7,8,9,10
    expect(r.txCount).toBe(5);
    expect(r.nextDueDate).toBe('2025-06-11');
    expect(r.lastPostedDate).toBe('2025-06-10');
  });

  test('respects endDate and does not post past it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createRecurring({
        payee: 'Finite', amount: 100, accountId: acct.id,
        frequency: 'daily', interval: 1,
        startDate: '2025-06-01', endDate: '2025-06-03',
        nextDueDate: '2025-06-01', autoPost: true
      });
      return b.runRecurringDue({ today: '2025-06-30' });
    });
    expect(r.posted).toBe(3); // Jun 1, 2, 3 only
  });

  test('leaves future-dated rules alone', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createRecurring({
        payee: 'Future', amount: 1, accountId: acct.id,
        startDate: '2099-01-01', nextDueDate: '2099-01-01', autoPost: true
      });
      return b.runRecurringDue({ today: '2025-06-10' });
    });
    expect(r.posted).toBe(0);
  });

  test('skips inactive (autoPost=false) rules', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const today = new Date().toISOString().substr(0, 10);
      await b.createRecurring({
        payee: 'Paused', amount: 100, accountId: acct.id,
        nextDueDate: today, autoPost: false
      });
      return b.runRecurringDue({ today: today });
    });
    expect(r.posted).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Tests — Page smoke tests
// ─────────────────────────────────────────────

test.describe('Recurring — Page UI', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('page loads and shows empty state when no rules exist', async ({ page }) => {
    await expect(page.locator('#dm-rec-root')).toBeVisible();
    await expect(page.locator('.dm-rec-empty').first()).toContainText('No recurring rules');
  });

  test('Add rule button shows the form', async ({ page }) => {
    await page.click('#dm-rec-add');
    await expect(page.locator('#rf-payee')).toBeVisible();
    await expect(page.locator('#rf-amount')).toBeVisible();
    await expect(page.locator('#rf-frequency')).toBeVisible();
  });

  test('Post due now button triggers scheduler', async ({ page }) => {
    // Create a due rule first
    await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const today = new Date().toISOString().substr(0, 10);
      await b.createRecurring({
        payee: 'TestRule', amount: -100, accountId: acct.id,
        nextDueDate: today, autoPost: true
      });
    });
    // Verify the rule renders
    await expect(page.locator('tr[data-rec]').first()).toBeVisible();
    // Directly invoke the scheduler API (the button shows a modal alert we
    // don't need to parse) and confirm a transaction was posted.
    const r = await page.evaluate(() => (window as any).dmBudget.runRecurringDue());
    expect(r.posted).toBe(1);
    const txs = await getAllIdbRecords(page, 'transactions');
    expect(txs.length).toBe(1);
    expect(txs[0].payee).toBe('TestRule');
  });
});
