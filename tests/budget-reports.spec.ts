import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
  DB_NAME,
  DB_VERSION,
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
      typeof (window as any).dmBudget.priorReportRange === 'function' &&
      typeof (window as any).dmBudget.getExpenseTrend === 'function' &&
      typeof (window as any).dmBudget.getDailySpend === 'function',
    { timeout: 10_000 },
  );
}

async function cleanupAllBudgetStores(page: Page) {
  // Use clear() instead of per-id delete so we wipe records that may have been
  // left over from other test files (IDB persists across Playwright contexts
  // for the same origin).
  await page.evaluate(
    ({ stores, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(stores as string[], 'readwrite');
          (stores as string[]).forEach((s) => tx.objectStore(s).clear());
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = (e: any) => {
            db.close();
            reject(e.target.error);
          };
        };
        req.onerror = (e: any) => reject(e.target.error);
      });
    },
    { stores: BUDGET_STORES as readonly string[], dbName: DB_NAME, dbVersion: DB_VERSION },
  );
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
// getExpenseTrend (Slice B data layer)
// ─────────────────────────────────────────────

test.describe('Budget Reports — getExpenseTrend', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
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

  test('day bucket: one point per day, fills missing days with 0', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1500, date: '2026-04-01', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -3000, date: '2026-04-03', payee: 'B' });
      return b.getExpenseTrend({ from: '2026-04-01', to: '2026-04-05', bucket: 'day' });
    });
    expect(result.bucket).toBe('day');
    expect(result.points.length).toBe(5); // 5-day inclusive range
    expect(result.points[0].cents).toBe(1500);
    expect(result.points[1].cents).toBe(0); // gap
    expect(result.points[2].cents).toBe(3000);
    expect(result.points[3].cents).toBe(0);
    expect(result.points[4].cents).toBe(0);
    expect(result.totalCents).toBe(4500);
    expect(result.peakCents).toBe(3000);
    expect(result.maWindow).toBe(7);
  });

  test('auto bucket picks day for short ranges, month for long ones', async ({ page }) => {
    const short = await page.evaluate(() =>
      (window as any).dmBudget.getExpenseTrend({ from: '2026-04-01', to: '2026-04-15', bucket: 'auto' }),
    );
    expect(short.bucket).toBe('day');

    const long = await page.evaluate(() =>
      (window as any).dmBudget.getExpenseTrend({ from: '2026-01-01', to: '2026-12-31', bucket: 'auto' }),
    );
    expect(long.bucket).toBe('month');
  });

  test('week bucket aggregates by Monday-anchored week', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      // 2026-04-01 is a Wednesday → its week starts Mon 2026-03-30
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1000, date: '2026-04-01', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -2000, date: '2026-04-03', payee: 'B' }); // same week (Fri)
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -5000, date: '2026-04-08', payee: 'C' }); // next week (Wed)
      return b.getExpenseTrend({ from: '2026-04-01', to: '2026-04-14', bucket: 'week' });
    });
    expect(result.bucket).toBe('week');
    // Two weeks: starting 2026-03-30 and 2026-04-06
    expect(result.points[0].key).toBe('2026-03-30');
    expect(result.points[0].cents).toBe(3000);
    expect(result.points[1].key).toBe('2026-04-06');
    expect(result.points[1].cents).toBe(5000);
  });

  test('month bucket aggregates by YYYY-MM key', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1000, date: '2026-02-15', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -3000, date: '2026-04-10', payee: 'B' });
      return b.getExpenseTrend({ from: '2026-02-01', to: '2026-04-30', bucket: 'month' });
    });
    expect(result.points.map((p: any) => p.key)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(result.points[0].cents).toBe(1000);
    expect(result.points[1].cents).toBe(0);
    expect(result.points[2].cents).toBe(3000);
  });

  test('credits split transactions per-split (no double-count)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
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
      return b.getExpenseTrend({ from: '2026-04-15', to: '2026-04-15', bucket: 'day' });
    });
    expect(result.totalCents).toBe(10000);
    expect(result.points[0].cents).toBe(10000);
  });

  test('moving average emits null until window is filled', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const seed = (window as any).__seed;
      // Seed a constant 1000/day for 10 days (Apr 1..Apr 10)
      for (let i = 0; i < 10; i++) {
        const day = String(1 + i).padStart(2, '0');
        const ds = `2026-04-${day}`;
        await b.createTransaction({ accountId: acct.id, categoryId: seed.foodId, amount: -1000, date: ds, payee: 'X' });
      }
      return b.getExpenseTrend({ from: '2026-04-01', to: '2026-04-10', bucket: 'day' });
    });
    // First 6 points (indexes 0..5) should have null MA, index 6 onwards = 1000
    expect(result.points[0].movingAvgCents).toBeNull();
    expect(result.points[5].movingAvgCents).toBeNull();
    expect(result.points[6].movingAvgCents).toBe(1000);
    expect(result.points[9].movingAvgCents).toBe(1000);
  });

  test('income transactions are excluded from trend', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: 100000, date: '2026-04-05', payee: 'Salary' });
      return b.getExpenseTrend({ from: '2026-04-01', to: '2026-04-10', bucket: 'day' });
    });
    expect(result.totalCents).toBe(0);
    expect(result.peakCents).toBe(0);
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

  test('trend section renders with bucket toggle', async ({ page }) => {
    await expect(page.locator('#dm-rpt-trend-section')).toBeVisible();
    await expect(page.locator('#dm-rpt-trend-section')).toContainText('Spending over time');
    const buttons = page.locator('#dm-rpt-trend-section .dm-rpt-bucket-toggle button');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.nth(0)).toHaveText('Day');
    await expect(buttons.nth(1)).toHaveText('Week');
    await expect(buttons.nth(2)).toHaveText('Month');
  });

  test('trend chart shows empty state when no expenses', async ({ page }) => {
    // Force a refresh after setup's cleanup wiped any leftover data
    const txCount = await page.evaluate(async () => {
      const txs = await (window as any).dmBudget.getTransactions({});
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
      return txs.length;
    });
    expect(txCount).toBe(0);
    await expect(page.locator('#dm-rpt-trend-svg')).toContainText('No expense data', { timeout: 5_000 });
  });

  test('trend chart renders line + stats after seeding', async ({ page }) => {
    const range = await page.evaluate(() => (window as any).dmBudget.resolveReportRange('this-month'));
    await page.evaluate(async (r) => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const cat = await b.createCategory({ name: 'Coffee', kind: 'expense', color: '#795548' });
      await b.createTransaction({ accountId: acct.id, categoryId: cat.id, amount: -1250, date: r.from, payee: 'Cafe' });
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
    }, range);
    // Stats row populates with $12.50 total
    await expect(page.locator('#dm-rpt-trend-stats')).toContainText('$12.50', { timeout: 5_000 });
    // SVG should have a line path
    await expect(page.locator('#dm-rpt-trend-svg path.line')).toBeVisible();
  });

  test('clicking a bucket button activates it', async ({ page }) => {
    const monthBtn = page.locator('#dm-rpt-trend-section .dm-rpt-bucket-toggle button[data-bucket="month"]');
    await monthBtn.click();
    await expect(monthBtn).toHaveClass(/active/);
  });

  test('heatmap section renders with year nav', async ({ page }) => {
    await expect(page.locator('#dm-rpt-heat-section')).toBeVisible();
    await expect(page.locator('#dm-rpt-heat-section')).toContainText('Daily spending heatmap');
    const yr = new Date().getFullYear();
    await expect(page.locator('#dm-rpt-heat-year')).toHaveText(String(yr));
    await expect(page.locator('#dm-rpt-heat-next')).toBeDisabled();
    await expect(page.locator('#dm-rpt-heat-prev')).toBeEnabled();
  });

  test('heatmap shows empty-state text when no expenses', async ({ page }) => {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dm-budget-updated')));
    const yr = new Date().getFullYear();
    await expect(page.locator('#dm-rpt-heat-svg')).toContainText('No expense data in ' + yr, { timeout: 5_000 });
  });

  test('heatmap renders day cells after seeding', async ({ page }) => {
    const yr = new Date().getFullYear();
    await page.evaluate(async (year) => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const cat = await b.createCategory({ name: 'Coffee', kind: 'expense', color: '#795548' });
      await b.createTransaction({ accountId: acct.id, categoryId: cat.id, amount: -1250, date: year + '-03-15', payee: 'Cafe' });
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
    }, yr);
    // 365 or 366 day cells
    const count = await page.locator('#dm-rpt-heat-svg rect.day').count();
    expect(count).toBeGreaterThanOrEqual(365);
    expect(count).toBeLessThanOrEqual(366);
    // At least one colored cell (lvl >= 1)
    await expect(page.locator('#dm-rpt-heat-svg rect.day.lvl-4').first()).toBeAttached({ timeout: 5_000 });
    await expect(page.locator('#dm-rpt-heat-stats')).toContainText('$12.50');
  });

  test('clicking previous-year navigates back', async ({ page }) => {
    const yr = new Date().getFullYear();
    await page.click('#dm-rpt-heat-prev');
    await expect(page.locator('#dm-rpt-heat-year')).toHaveText(String(yr - 1));
    await expect(page.locator('#dm-rpt-heat-next')).toBeEnabled();
  });
});

// ─────────────────────────────────────────────
// getDailySpend (Slice C helper)
// ─────────────────────────────────────────────

test.describe('Budget Reports — getDailySpend', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('returns one entry per calendar day for the year', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window as any).dmBudget.getDailySpend({ year: 2025 }),
    );
    expect(result.year).toBe(2025);
    expect(result.days.length).toBe(365); // 2025 is not a leap year
    expect(result.days[0].date).toBe('2025-01-01');
    expect(result.days[result.days.length - 1].date).toBe('2025-12-31');
  });

  test('handles leap years correctly', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window as any).dmBudget.getDailySpend({ year: 2024 }),
    );
    expect(result.days.length).toBe(366);
  });

  test('weekIndex starts at 0 and increments per Sunday', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window as any).dmBudget.getDailySpend({ year: 2024 }),
    );
    // Jan 1 2024 was a Monday (dow=1), so weekIndex=0
    expect(result.days[0].dow).toBe(1);
    expect(result.days[0].weekIndex).toBe(0);
    // Jan 6 2024 (index 5) was a Saturday (dow=6), still week 0
    expect(result.days[5].date).toBe('2024-01-06');
    expect(result.days[5].weekIndex).toBe(0);
    // Jan 7 2024 (index 6) was a Sunday (dow=0), week 1
    expect(result.days[6].date).toBe('2024-01-07');
    expect(result.days[6].dow).toBe(0);
    expect(result.days[6].weekIndex).toBe(1);
    expect(result.firstDow).toBe(1);
  });

  test('aggregates expense amounts per day', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -1000, date: '2026-03-15', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -500, date: '2026-03-15', payee: 'B' });
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -200, date: '2026-03-16', payee: 'C' });
      return b.getDailySpend({ year: 2026 });
    });
    const mar15 = result.days.find((d: any) => d.date === '2026-03-15');
    const mar16 = result.days.find((d: any) => d.date === '2026-03-16');
    expect(mar15.cents).toBe(1500);
    expect(mar16.cents).toBe(200);
    expect(result.totalCents).toBe(1700);
    expect(result.peakCents).toBe(1500);
  });

  test('excludes income, transactions outside year, and soft-deleted', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      // Income — should be ignored
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: 50000, date: '2026-04-01', payee: 'Salary' });
      // Other year — should be excluded
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -9999, date: '2025-04-01', payee: 'Old' });
      // Valid expense
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -1000, date: '2026-04-02', payee: 'Lunch' });
      // Soft-deleted
      const tx = await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -7777, date: '2026-04-03', payee: 'Trashed' });
      await b.deleteTransaction(tx.id);
      return b.getDailySpend({ year: 2026 });
    });
    expect(result.totalCents).toBe(1000);
    const apr1 = result.days.find((d: any) => d.date === '2026-04-01');
    const apr3 = result.days.find((d: any) => d.date === '2026-04-03');
    expect(apr1.cents).toBe(0);
    expect(apr3.cents).toBe(0);
  });

  test('credits split transaction amounts per day', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      const c1 = await b.createCategory({ name: 'Food', kind: 'expense', color: '#a00' });
      const c2 = await b.createCategory({ name: 'Travel', kind: 'expense', color: '#0a0' });
      const tx = await b.createTransaction({ accountId: acct.id, categoryId: c1.id, amount: -3000, date: '2026-05-10', payee: 'Trip' });
      await b.splitTransaction(tx.id, [
        { categoryId: c1.id, amount: -1200, memo: '' },
        { categoryId: c2.id, amount: -1800, memo: '' },
      ]);
      return b.getDailySpend({ year: 2026 });
    });
    const may10 = result.days.find((d: any) => d.date === '2026-05-10');
    expect(may10.cents).toBe(3000);
  });

  test('percentiles fall back to peak quartiles when fewer than 4 non-zero days', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const b = (window as any).dmBudget;
      const acct = await b.ensureDefaultAccount();
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -1000, date: '2026-06-01', payee: 'A' });
      await b.createTransaction({ accountId: acct.id, categoryId: null, amount: -2000, date: '2026-06-02', payee: 'B' });
      return b.getDailySpend({ year: 2026 });
    });
    // 2 non-zero days → fallback path; peak=2000 → p95=2000, p50=500, p75=1000, p90=1500
    expect(result.peakCents).toBe(2000);
    expect(result.percentiles.p95).toBe(2000);
    expect(result.percentiles.p50).toBe(500);
    expect(result.percentiles.p75).toBe(1000);
    expect(result.percentiles.p90).toBe(1500);
  });

  test('defaults year to current calendar year', async ({ page }) => {
    const result = await page.evaluate(() =>
      (window as any).dmBudget.getDailySpend({}),
    );
    expect(result.year).toBe(new Date().getFullYear());
  });
});
