import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
} from './helpers';

// ─────────────────────────────────────────────
// Helpers — mirror of budget-recurring.spec.ts
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
      typeof (window as any).dmBudget.setBudget === 'function' &&
      typeof (window as any).dmBudget.getMonthSummary === 'function',
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
  await page.goto('./docs/budget/');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await cleanupAllBudgetStores(page);
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
}

// Create a category and return its id
async function createCategory(page: Page, name: string, kind: 'expense' | 'income' = 'expense') {
  return page.evaluate(
    async ([n, k]) => {
      const c = await (window as any).dmBudget.createCategory({ name: n, kind: k });
      return c.id;
    },
    [name, kind] as const,
  );
}

// ─────────────────────────────────────────────
// Tests — getMonthSummary rollover math
// ─────────────────────────────────────────────

test.describe('Rollover — summary math', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('setBudget persists rollover flag', async ({ page }) => {
    const catId = await createCategory(page, 'Groceries');
    await page.evaluate(
      async (id) => {
        await (window as any).dmBudget.setBudget('2025-06', id, 50000, { rollover: true });
      },
      catId,
    );
    const rows = await getAllIdbRecords(page, 'budgets');
    const row = rows.find((r) => r.categoryId === catId && r.month === '2025-06');
    expect(row).toBeTruthy();
    expect(row.rollover).toBe(true);
    expect(row.allocated).toBe(50000);
  });

  test('single-month rollover: leftover carries into next month', async ({ page }) => {
    const catId = await createCategory(page, 'Groceries');
    const acct = await page.evaluate(
      async () => (await (window as any).dmBudget.ensureDefaultAccount()).id,
    );
    const summary = await page.evaluate(
      async ({ id, acctId }) => {
        const b = (window as any).dmBudget;
        // May: $500 allocated, $300 spent, rollover on → $200 leftover
        await b.setBudget('2025-05', id, 50000, { rollover: true });
        await b.createTransaction({
          accountId: acctId, categoryId: id,
          amount: -30000, date: '2025-05-15', payee: 'Market',
        });
        // June: $500 allocated
        await b.setBudget('2025-06', id, 50000, { rollover: false });
        return b.getMonthSummary('2025-06');
      },
      { id: catId, acctId: acct },
    );
    const row = summary.categories.find((r: any) => r.id === catId);
    expect(row.allocated).toBe(50000);
    expect(row.rolledOverCents).toBe(20000);
    expect(row.effectiveAllocated).toBe(70000);
    expect(row.remaining).toBe(70000);
    expect(summary.rolledOver).toBe(20000);
  });

  test('multi-month chain accumulates leftovers', async ({ page }) => {
    const catId = await createCategory(page, 'Savings');
    const acct = await page.evaluate(
      async () => (await (window as any).dmBudget.ensureDefaultAccount()).id,
    );
    const summary = await page.evaluate(
      async ({ id, acctId }) => {
        const b = (window as any).dmBudget;
        // Jan: $100 budgeted, $40 spent (leftover $60), rollover on
        await b.setBudget('2025-01', id, 10000, { rollover: true });
        await b.createTransaction({
          accountId: acctId, categoryId: id,
          amount: -4000, date: '2025-01-10',
        });
        // Feb: $100 budgeted, $80 spent (carry $60 + new $100 − $80 = $80), rollover on
        await b.setBudget('2025-02', id, 10000, { rollover: true });
        await b.createTransaction({
          accountId: acctId, categoryId: id,
          amount: -8000, date: '2025-02-10',
        });
        // Mar: $100 budgeted → rolledOver should be $80
        await b.setBudget('2025-03', id, 10000, { rollover: false });
        return b.getMonthSummary('2025-03');
      },
      { id: catId, acctId: acct },
    );
    const row = summary.categories.find((r: any) => r.id === catId);
    expect(row.allocated).toBe(10000);
    expect(row.rolledOverCents).toBe(8000);
    expect(row.effectiveAllocated).toBe(18000);
  });

  test('negative leftover does not carry (clamps at zero)', async ({ page }) => {
    const catId = await createCategory(page, 'Dining');
    const acct = await page.evaluate(
      async () => (await (window as any).dmBudget.ensureDefaultAccount()).id,
    );
    const summary = await page.evaluate(
      async ({ id, acctId }) => {
        const b = (window as any).dmBudget;
        // May: $200 budgeted, $300 spent (−$100 over), rollover on
        await b.setBudget('2025-05', id, 20000, { rollover: true });
        await b.createTransaction({
          accountId: acctId, categoryId: id,
          amount: -30000, date: '2025-05-15',
        });
        await b.setBudget('2025-06', id, 20000, { rollover: false });
        return b.getMonthSummary('2025-06');
      },
      { id: catId, acctId: acct },
    );
    const row = summary.categories.find((r: any) => r.id === catId);
    expect(row.rolledOverCents).toBe(0);
    expect(row.effectiveAllocated).toBe(20000);
  });

  test('rollover=false breaks the chain', async ({ page }) => {
    const catId = await createCategory(page, 'Fun');
    const summary = await page.evaluate(
      async (id) => {
        const b = (window as any).dmBudget;
        // Jan: $100, no tx, rollover ON → $100 leftover
        await b.setBudget('2025-01', id, 10000, { rollover: true });
        // Feb: $100, no tx, rollover OFF → chain broken
        await b.setBudget('2025-02', id, 10000, { rollover: false });
        // Mar: $100 — should see $0 rolledOver (Feb broke the chain)
        await b.setBudget('2025-03', id, 10000, { rollover: false });
        return b.getMonthSummary('2025-03');
      },
      catId,
    );
    const row = summary.categories.find((r: any) => r.id === catId);
    expect(row.rolledOverCents).toBe(0);
  });

  test('no prior budget → rolledOver is zero', async ({ page }) => {
    const catId = await createCategory(page, 'Brand new');
    const summary = await page.evaluate(
      async (id) => {
        const b = (window as any).dmBudget;
        await b.setBudget('2025-06', id, 10000, { rollover: false });
        return b.getMonthSummary('2025-06');
      },
      catId,
    );
    const row = summary.categories.find((r: any) => r.id === catId);
    expect(row.rolledOverCents).toBe(0);
    expect(row.rollover).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Tests — UI toggle
// ─────────────────────────────────────────────

test.describe('Rollover — UI toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('clicking rollover toggle persists the flag and toggles class', async ({ page }) => {
    const catId = await createCategory(page, 'Groceries');
    await page.evaluate(
      async (id) => {
        await (window as any).dmBudget.setBudget(
          (window as any).dmBudget.currentMonth(),
          id,
          40000,
          { rollover: false },
        );
      },
      catId,
    );
    // Force a refresh via the page's own event
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
    });
    const btn = page.locator(`[data-cat-rollover="${catId}"]`);
    await expect(btn).toBeVisible({ timeout: 5000 });
    await expect(btn).not.toHaveClass(/active/);

    await btn.click();
    await expect(btn).toHaveClass(/active/, { timeout: 3000 });

    const persisted = await page.evaluate(
      async (id) => {
        const month = (window as any).dmBudget.currentMonth();
        const rows = await (window as any).dmBudget.getBudgetsForMonth(month);
        return rows.find((r: any) => r.categoryId === id);
      },
      catId,
    );
    expect(persisted.rollover).toBe(true);
    expect(persisted.allocated).toBe(40000);
  });

  test('editing allocation preserves rollover flag', async ({ page }) => {
    const catId = await createCategory(page, 'Groceries');
    const month = await page.evaluate(() => (window as any).dmBudget.currentMonth());
    await page.evaluate(
      async ({ id, m }) => {
        await (window as any).dmBudget.setBudget(m, id, 40000, { rollover: true });
      },
      { id: catId, m: month },
    );
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('dm-budget-updated'));
    });

    const input = page.locator(`[data-cat-input="${catId}"]`);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill('600.00');
    await input.blur();

    // Poll until the update lands (blur handler is async)
    await page.waitForFunction(
      async ({ id, m }) => {
        const rows = await (window as any).dmBudget.getBudgetsForMonth(m);
        const row = rows.find((r: any) => r.categoryId === id);
        return row && row.allocated === 60000;
      },
      { id: catId, m: month },
      { timeout: 5000 },
    );

    const row = await page.evaluate(
      async ({ id, m }) => {
        const rows = await (window as any).dmBudget.getBudgetsForMonth(m);
        return rows.find((r: any) => r.categoryId === id);
      },
      { id: catId, m: month },
    );
    expect(row.allocated).toBe(60000);
    expect(row.rollover).toBe(true);
  });
});
