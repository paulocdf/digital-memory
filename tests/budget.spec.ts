import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const BUDGET_STORES = [
  'accounts',
  'categories',
  'budgets',
  'transactions',
  'recurring',
] as const;

/** Wait for window.dmBudget API to be exposed. */
async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () =>
      !!(window as any).dmBudget &&
      typeof (window as any).dmBudget.createCategory === 'function' &&
      typeof (window as any).dmBudget.formatMoney === 'function',
    { timeout: 10_000 },
  );
}

/** Wipe every budget-related IDB store so tests are isolated. */
async function cleanupAllBudgetStores(page: Page) {
  for (const store of BUDGET_STORES) {
    const recs = await getAllIdbRecords(page, store);
    const ids = recs.map((r) => r.id).filter(Boolean);
    if (ids.length) await cleanupIdb(page, store, ids);
  }
  // Also reset local-only flag so it doesn't leak between tests
  await page.evaluate(() => {
    localStorage.removeItem('dm-budget-local-only');
    localStorage.removeItem('dm-budget-currency');
  });
}

/** Standard setup: mock auth, land on budget page, wait for APIs. */
async function setupBudget(page: Page) {
  await injectMockAuth(page, MOCK_USER);
  await page.goto('./docs/budget/');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await cleanupAllBudgetStores(page);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

test.describe('Budget — Public API surface', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('exposes window.dmBudget with expected methods', async ({ page }) => {
    const api = await page.evaluate(() => {
      const b = (window as any).dmBudget;
      if (!b) return null;
      return {
        hasCurrentMonth: typeof b.currentMonth === 'function',
        hasGetCurrency: typeof b.getCurrency === 'function',
        hasSetCurrency: typeof b.setCurrency === 'function',
        hasIsLocalOnly: typeof b.isLocalOnly === 'function',
        hasSetLocalOnly: typeof b.setLocalOnly === 'function',
        hasEraseAllData: typeof b.eraseAllData === 'function',
        hasEnsureDefaultAccount: typeof b.ensureDefaultAccount === 'function',
        hasCreateCategory: typeof b.createCategory === 'function',
        hasGetCategories: typeof b.getCategories === 'function',
        hasSetBudget: typeof b.setBudget === 'function',
        hasGetBudgetsForMonth: typeof b.getBudgetsForMonth === 'function',
        hasCreateTransaction: typeof b.createTransaction === 'function',
        hasGetTransactions: typeof b.getTransactions === 'function',
        hasGetMonthSummary: typeof b.getMonthSummary === 'function',
        hasFormatMoney: typeof b.formatMoney === 'function',
        hasParseMoney: typeof b.parseMoney === 'function',
      };
    });
    expect(api).not.toBeNull();
    Object.entries(api!).forEach(([k, v]) => expect(v, k).toBe(true));
  });

  test('currentMonth returns YYYY-MM for the current month', async ({ page }) => {
    const month = await page.evaluate(() => (window as any).dmBudget.currentMonth());
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    const today = new Date();
    const expected =
      today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    expect(month).toBe(expected);
  });
});

test.describe('Budget — Money formatting', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test('formatMoney renders integer cents as currency', async ({ page }) => {
    const result = await page.evaluate(() => {
      const b = (window as any).dmBudget;
      return {
        usd: b.formatMoney(12345, { currency: 'USD' }),
        eur: b.formatMoney(-5000, { currency: 'EUR' }),
        zero: b.formatMoney(0, { currency: 'USD' }),
      };
    });
    // Intl.NumberFormat output varies by locale, so assert loosely.
    expect(result.usd).toMatch(/123[.,]45/);
    expect(result.usd).toMatch(/\$|USD/);
    expect(result.eur).toMatch(/50[.,]00/);
    expect(result.eur).toMatch(/-|\(/); // negative indicator
    expect(result.zero).toMatch(/0[.,]00/);
  });

  test('parseMoney accepts plain, prefixed, and parenthesized input', async ({ page }) => {
    const result = await page.evaluate(() => {
      const b = (window as any).dmBudget;
      return {
        plain: b.parseMoney('12.34'),
        dollars: b.parseMoney('$12.34'),
        thousands: b.parseMoney('1,234.56'),
        negative: b.parseMoney('-12.50'),
        parens: b.parseMoney('(12.50)'),
        empty: b.parseMoney(''),
        nullish: b.parseMoney(null),
      };
    });
    expect(result.plain).toBe(1234);
    expect(result.dollars).toBe(1234);
    expect(result.thousands).toBe(123456);
    expect(result.negative).toBe(-1250);
    expect(result.parens).toBe(-1250);
    expect(result.empty).toBe(0);
    expect(result.nullish).toBe(0);
  });
});

test.describe('Budget — Currency & local-only mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('setCurrency persists to localStorage and dispatches event', async ({ page }) => {
    const fired = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        let got = false;
        const handler = () => { got = true; };
        window.addEventListener('dm-budget-updated', handler, { once: true });
        (window as any).dmBudget.setCurrency('EUR');
        setTimeout(() => {
          window.removeEventListener('dm-budget-updated', handler);
          resolve(got);
        }, 100);
      });
    });
    expect(fired).toBe(true);
    const stored = await page.evaluate(() => localStorage.getItem('dm-budget-currency'));
    expect(stored).toBe('EUR');
    const active = await page.evaluate(() => (window as any).dmBudget.getCurrency());
    expect(active).toBe('EUR');
  });

  test('setLocalOnly toggles the flag and getCurrency still works', async ({ page }) => {
    await page.evaluate(() => (window as any).dmBudget.setLocalOnly(true));
    const on = await page.evaluate(() => (window as any).dmBudget.isLocalOnly());
    expect(on).toBe(true);
    const stored = await page.evaluate(() =>
      localStorage.getItem('dm-budget-local-only'),
    );
    expect(stored).toBeTruthy();

    await page.evaluate(() => (window as any).dmBudget.setLocalOnly(false));
    const off = await page.evaluate(() => (window as any).dmBudget.isLocalOnly());
    expect(off).toBe(false);
  });
});

test.describe('Budget — Accounts & categories', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('ensureDefaultAccount creates a Main account on first call', async ({ page }) => {
    const account = await page.evaluate(() =>
      (window as any).dmBudget.ensureDefaultAccount(),
    );
    expect(account).toBeTruthy();
    expect(account.name).toBeTruthy();
    expect(account.userId).toBe(MOCK_USER.uid);

    // Calling again returns the same account (idempotent)
    const again = await page.evaluate(() =>
      (window as any).dmBudget.ensureDefaultAccount(),
    );
    expect(again.id).toBe(account.id);

    const all = await getAllIdbRecords(page, 'accounts');
    expect(all.filter((a) => !a.deletedAt).length).toBe(1);
  });

  test('createCategory stores a category with the right shape', async ({ page }) => {
    const created = await page.evaluate(() =>
      (window as any).dmBudget.createCategory({ name: 'Groceries', kind: 'expense' }),
    );
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Groceries');
    expect(created.kind).toBe('expense');
    expect(created.userId).toBe(MOCK_USER.uid);

    const list = await page.evaluate(() =>
      (window as any).dmBudget.getCategories(),
    );
    expect(list.map((c: any) => c.name)).toContain('Groceries');
  });

  test('deleteCategory removes the category (Phase 1 hard delete)', async ({ page }) => {
    const created = await page.evaluate(() =>
      (window as any).dmBudget.createCategory({ name: 'Tmp', kind: 'expense' }),
    );
    await page.evaluate(
      (id) => (window as any).dmBudget.deleteCategory(id),
      created.id,
    );
    const list = await page.evaluate(() =>
      (window as any).dmBudget.getCategories(),
    );
    expect(list.find((c: any) => c.id === created.id)).toBeUndefined();

    const allRaw = await getAllIdbRecords(page, 'categories');
    expect(allRaw.find((c) => c.id === created.id)).toBeUndefined();
  });
});

test.describe('Budget — Envelopes & transactions', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('setBudget upserts with deterministic {month}_{categoryId} id', async ({ page }) => {
    const catId = await page.evaluate(async () => {
      const c = await (window as any).dmBudget.createCategory({
        name: 'Rent', kind: 'expense',
      });
      return c.id;
    });
    const month = await page.evaluate(() =>
      (window as any).dmBudget.currentMonth(),
    );

    await page.evaluate(
      ([m, c]) => (window as any).dmBudget.setBudget(m, c, 150000),
      [month, catId],
    );
    await page.evaluate(
      ([m, c]) => (window as any).dmBudget.setBudget(m, c, 200000),
      [month, catId],
    );

    const budgets = await page.evaluate(
      (m) => (window as any).dmBudget.getBudgetsForMonth(m),
      month,
    );
    const mine = budgets.filter((b: any) => b.categoryId === catId);
    expect(mine.length).toBe(1);
    expect(mine[0].allocated).toBe(200000);
    expect(mine[0].id).toBe(`${month}_${catId}`);
  });

  test('createTransaction persists signed cents and is retrievable by month', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acc = await b.ensureDefaultAccount();
      const cat = await b.createCategory({ name: 'Food', kind: 'expense' });
      const month = b.currentMonth();
      const tx = await b.createTransaction({
        accountId: acc.id,
        categoryId: cat.id,
        amount: -4250, // $42.50 expense
        date: month + '-05',
        payee: 'Cafe',
      });
      const listed = await b.getTransactions({ month: month });
      return { tx, month, listedCount: listed.length, listedPayee: listed[0] && listed[0].payee };
    });
    expect(result.tx.id).toBeTruthy();
    expect(result.tx.amount).toBe(-4250);
    expect(result.tx.payee).toBe('Cafe');
    expect(result.tx.date.startsWith(result.month)).toBe(true);
    expect(result.listedCount).toBe(1);
    expect(result.listedPayee).toBe('Cafe');
  });

  test('getMonthSummary aggregates income, allocations, and per-category spent', async ({ page }) => {
    const summary = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acc = await b.ensureDefaultAccount();
      const food = await b.createCategory({ name: 'Food', kind: 'expense' });
      const salary = await b.createCategory({ name: 'Salary', kind: 'income' });
      const month = b.currentMonth();
      await b.setBudget(month, food.id, 50000);
      await b.createTransaction({
        accountId: acc.id, categoryId: food.id,
        amount: -1500, date: month + '-03', payee: 'Store',
      });
      await b.createTransaction({
        accountId: acc.id, categoryId: food.id,
        amount: -2500, date: month + '-10', payee: 'Restaurant',
      });
      await b.createTransaction({
        accountId: acc.id, categoryId: salary.id,
        amount: 300000, date: month + '-01', payee: 'Employer',
      });
      return b.getMonthSummary(month);
    });

    expect(summary).toBeTruthy();
    expect(summary.income).toBe(300000);
    expect(summary.allocated).toBe(50000);
    expect(summary.toBeBudgeted).toBe(300000 - 50000);
    const foodRow = summary.categories.find((c: any) => c.name === 'Food');
    expect(foodRow).toBeTruthy();
    expect(foodRow.allocated).toBe(50000);
    expect(foodRow.spent).toBe(4000); // stored as positive magnitude for expense categories
    expect(foodRow.remaining).toBe(46000);
    const salaryRow = summary.categories.find((c: any) => c.name === 'Salary');
    expect(salaryRow).toBeTruthy();
    expect(salaryRow.spent).toBe(300000); // income shows up as "spent" magnitude on income-kind rows
  });
});

test.describe('Budget — Erase', () => {
  test.beforeEach(async ({ page }) => {
    await setupBudget(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('eraseAllData({ eraseCloud: false }) wipes local budget stores', async ({ page }) => {
    // Seed some data via the public API
    const ids = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acc = await b.ensureDefaultAccount();
      const c = await b.createCategory({ name: 'X', kind: 'expense' });
      const tx = await b.createTransaction({
        accountId: acc.id, categoryId: c.id,
        amount: -1000, date: b.currentMonth() + '-01', payee: 'T',
      });
      await b.setBudget(b.currentMonth(), c.id, 10000);
      return { accId: acc.id, catId: c.id, txId: tx.id };
    });

    // Preconditions — every seeded record is in its store
    const beforeTx = await getAllIdbRecords(page, 'transactions');
    const beforeBg = await getAllIdbRecords(page, 'budgets');
    expect(beforeTx.find((t) => t.id === ids.txId)).toBeTruthy();
    expect(beforeBg.length).toBeGreaterThan(0);

    await page.evaluate(() =>
      (window as any).dmBudget.eraseAllData({ eraseCloud: false }),
    );

    // We only assert on transactions and budgets — the overview page that's
    // currently loaded auto-re-seeds accounts + categories via its refresh
    // listener (seedDefaultsIfEmpty + ensureDefaultAccount) on the
    // dm-budget-updated event that eraseAllData fires. That's expected UX.
    const afterTx = await getAllIdbRecords(page, 'transactions');
    const afterBg = await getAllIdbRecords(page, 'budgets');
    const afterRec = await getAllIdbRecords(page, 'recurring');
    expect(afterTx.length).toBe(0);
    expect(afterBg.length).toBe(0);
    expect(afterRec.length).toBe(0);
  });
});

test.describe('Budget — UI pages', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockAuth(page, MOCK_USER);
  });

  test('budget overview page renders skeleton (month label + quick-add)', async ({ page }) => {
    await page.goto('./docs/budget/');
    await waitForDmSync(page);
    await waitForDmBudget(page);

    // The budget root is in the initial HTML skeleton.
    await expect(page.locator('#dm-budget-root')).toBeVisible();

    // renderSkeleton() is called synchronously from init() after dmAuthReady
    // resolves, so the month label element appears shortly after load.
    await expect(page.locator('#dm-bgt-mlabel')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#dm-bgt-quickadd')).toBeVisible();
    await expect(page.locator('#dm-bgt-qa-amount')).toBeVisible();

    await cleanupAllBudgetStores(page);
  });

  test('transactions page renders toolbar', async ({ page }) => {
    await page.goto('./docs/budget/transactions/');
    await waitForDmSync(page);
    await waitForDmBudget(page);

    await expect(page.locator('#dm-tx-root')).toBeVisible();
    await expect(page.locator('#dm-tx-month')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#dm-tx-category')).toBeVisible();
    await expect(page.locator('#dm-tx-search')).toBeVisible();

    await cleanupAllBudgetStores(page);
  });
});
