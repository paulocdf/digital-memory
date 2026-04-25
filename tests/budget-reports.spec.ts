import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
} from './helpers';

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
      typeof (window as any).dmBudget.getCategorySpend === 'function' &&
      typeof (window as any).dmBudget.resolveReportRange === 'function' &&
      typeof (window as any).dmBudget.priorReportRange === 'function',
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

async function setup(page: Page, gotoPath: string = './') {
  await injectMockAuth(page, MOCK_USER);
  await page.goto(gotoPath);
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await cleanupAllBudgetStores(page);
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
}

// ─────────────────────────────────────────────
// resolveReportRange / priorReportRange (pure helpers)
// ─────────────────────────────────────────────

test.describe('Budget Reports — resolveReportRange', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('this-month default returns first-of-month → today', async ({ page }) => {
    const r = await page.evaluate(() => (window as any).dmBudget.resolveReportRange());
    const today = new Date();
    const expectedFromMonth = today.toISOString().substr(0, 7);
    expect(r.from.startsWith(expectedFromMonth)).toBe(true);
    expect(r.from.endsWith('-01')).toBe(true);
    expect(r.label).toBe('This month');
    expect(r.preset).toBe('this-month');
  });

  test('last-month returns full prior calendar month', async ({ page }) => {
    const r = await page.evaluate(() => (window as any).dmBudget.resolveReportRange('last-month'));
    expect(r.from.endsWith('-01')).toBe(true);
    expect(r.label).toBe('Last month');
    // from < to
    expect(r.from < r.to).toBe(true);
  });

  test('ytd returns Jan 1 of current year → today', async ({ page }) => {
    const r = await page.evaluate(() => (window as any).dmBudget.resolveReportRange('ytd'));
    const yr = new Date().getFullYear();
    expect(r.from).toBe(yr + '-01-01');
    expect(r.preset).toBe('ytd');
  });

  test('custom range echoes through unchanged', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudget.resolveReportRange({ from: '2026-03-01', to: '2026-03-31' }),
    );
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-03-31');
  });

  test('priorReportRange returns equal-length prior period ending day before from', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudget.priorReportRange({ from: '2026-04-01', to: '2026-04-30' }),
    );
    expect(r!.to).toBe('2026-03-31');
    expect(r!.from).toBe('2026-03-02'); // 30 days back
  });

  test('priorReportRange handles single-day range', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudget.priorReportRange({ from: '2026-04-15', to: '2026-04-15' }),
    );
    expect(r!.from).toBe('2026-04-14');
    expect(r!.to).toBe('2026-04-14');
  });

  test('priorReportRange returns null for missing input', async ({ page }) => {
    const r = await page.evaluate(() => (window as any).dmBudget.priorReportRange(null));
    expect(r).toBeNull();
  });
});

// ─────────────────────────────────────────────
// getCategorySpend (data layer)
// ─────────────────────────────────────────────

test.describe('Budget Reports — getCategorySpend', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    // Seed two categories
    await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const food = await b.createCategory({ name: 'Food', kind: 'expense', color: '#e53935' });
      const trans = await b.createCategory({ name: 'Transport', kind: 'expense', color: '#1976d2' });
      (window as any).__seed = { foodId: food.id, transId: trans.id };
    });
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('aggregates expenses by category for current period', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1500, date: '2026-04-05', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -2500, date: '2026-04-10', payee: 'B' });
      await b.createTransaction({ accountId: acct.id, categoryId: seed.transId, amount: -3000, date: '2026-04-12', payee: 'C' });
      // Income — should NOT show up in spending breakdown
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: 100000, date: '2026-04-01', payee: 'Salary' });
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    expect(result.currentTotal).toBe(7000); // 1500 + 2500 + 3000
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].name).toBe('Food'); // 4000 > 3000, sorted by spend desc
    expect(result.rows[0].currentCents).toBe(4000);
    expect(result.rows[0].count).toBe(2);
    expect(result.rows[1].name).toBe('Transport');
    expect(result.rows[1].currentCents).toBe(3000);
    expect(result.rows[1].count).toBe(1);
  });

  test('computes prior-period delta', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      // March (prior): 5000 on Food
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -5000, date: '2026-03-15', payee: 'M' });
      // April (current): 7000 on Food
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -7000, date: '2026-04-10', payee: 'A' });
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    const food = result.rows.find((r: any) => r.name === 'Food');
    expect(food.currentCents).toBe(7000);
    expect(food.priorCents).toBe(5000);
    expect(food.deltaCents).toBe(2000);
    expect(food.deltaPct).toBe(40);
  });

  test('credits split transactions per-category', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      // One -10000 tx split 60/40 across Food/Transport
      await b.createTransaction({
        accountId: acct.id,
        amount: -10000,
        date: '2026-04-15',
        payee: 'Mixed',
        splits: [
          { categoryId: seed.foodId, amount: -6000, memo: '' },
          { categoryId: seed.transId, amount: -4000, memo: '' },
        ],
      });
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    expect(result.currentTotal).toBe(10000);
    const food = result.rows.find((r: any) => r.name === 'Food');
    const trans = result.rows.find((r: any) => r.name === 'Transport');
    expect(food.currentCents).toBe(6000);
    expect(trans.currentCents).toBe(4000);
  });

  test('groups uncategorized expenses under "Uncategorized"', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -1234, date: '2026-04-10', payee: 'X' });
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('Uncategorized');
    expect(result.rows[0].categoryId).toBeNull();
    expect(result.rows[0].currentCents).toBe(1234);
  });

  test('returns empty result when no transactions in range', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window as any).dmBudget.getCategorySpend({ from: '2099-01-01', to: '2099-01-31' }),
    );
    expect(result.currentTotal).toBe(0);
    expect(result.rows.length).toBe(0);
  });

  test('ignores soft-deleted transactions', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      const tx = await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1500, date: '2026-04-05', payee: 'A' });
      await b.deleteTransaction(tx.id);
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    expect(result.currentTotal).toBe(0);
  });

  test('marks new categories (no prior spend) with deltaPct=null', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      // Only April spending, no March
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -2500, date: '2026-04-05', payee: 'A' });
      return b.getCategorySpend({ from: '2026-04-01', to: '2026-04-30' });
    });
    const food = result.rows.find((r: any) => r.name === 'Food');
    expect(food.priorCents).toBe(0);
    expect(food.deltaPct).toBeNull();
  });
});

// ─────────────────────────────────────────────
// UI smoke
// ─────────────────────────────────────────────

test.describe('Budget Reports — UI smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, './docs/budget/reports/');
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('reports page renders with empty state', async ({ page }) => {
    await expect(page.locator('#dm-rpt-root')).toBeVisible();
    await expect(page.locator('#dm-rpt-range')).toBeVisible();
    await expect(page.locator('#dm-rpt-cat-section')).toContainText('Spending by category');
    // Donut should render "No spending" placeholder
    await expect(page.locator('#dm-rpt-donut')).toContainText('No spending');
  });

  test('switching range to custom reveals date inputs', async ({ page }) => {
    await page.selectOption('#dm-rpt-range', 'custom');
    await expect(page.locator('#dm-rpt-custom')).toBeVisible();
    await expect(page.locator('#dm-rpt-from')).toBeVisible();
    await expect(page.locator('#dm-rpt-to')).toBeVisible();
  });

  test('renders category breakdown after seeding a transaction', async ({ page }) => {
    // Get current month range
    const range = await page.evaluate(() => (window as any).dmBudget.resolveReportRange('this-month'));
    await page.evaluate(async (r) => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const cat = await b.createCategory({ name: 'Coffee', kind: 'expense', color: '#795548' });
      await b.createTransaction({ accountId: acct.id, categoryId: cat.id, amount: -1250, date: r.from, payee: 'Cafe' });
      // Trigger refresh
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
    }, range);
    // Wait for the row to appear
    await expect(page.locator('#dm-rpt-cat-list .dm-rpt-cat-row')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator('#dm-rpt-cat-list')).toContainText('Coffee');
  });

  test('range label updates after switching range', async ({ page }) => {
    await page.selectOption('#dm-rpt-range', 'ytd');
    const yr = new Date().getFullYear();
    await expect(page.locator('#dm-rpt-range-label')).toContainText(yr + '-01-01');
  });
});
