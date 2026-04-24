import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
  getAllIdbRecords,
  waitForDmSync,
} from './helpers';

// Phase 2 Slice C — Split transactions
// Exercises the data-layer behavior: serialization, validation, aggregation.

const BUDGET_STORES = ['accounts', 'categories', 'budgets', 'transactions', 'recurring'] as const;

async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).dmBudget && typeof (window as any).dmBudget.splitTransaction === 'function',
    { timeout: 10_000 },
  );
}

async function cleanupAll(page: Page) {
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
  await cleanupAll(page);
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
}

async function createCategory(page: Page, name: string, kind: 'expense' | 'income' = 'expense') {
  return page.evaluate(
    async ([n, k]) => {
      const c = await (window as any).dmBudget.createCategory({ name: n, kind: k });
      return c.id as string;
    },
    [name, kind] as const,
  );
}

test.describe('Split transactions — data layer', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('splits API is exposed on window.dmBudget', async ({ page }) => {
    const exposed = await page.evaluate(() => {
      return typeof (window as any).dmBudget.splitTransaction === 'function';
    });
    expect(exposed).toBe(true);
  });

  test('createTransaction with empty splits behaves like a normal single-category tx', async ({ page }) => {
    const catId = await createCategory(page, 'Food');
    const tx = await page.evaluate(async (catId) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      return await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: catId,
        amount: -5000,
        date: '2026-04-15',
        payee: 'test',
        splits: [],
      });
    }, catId);
    expect(tx.categoryId).toBe(catId);
    expect(tx.splits).toEqual([]);
    expect(tx.amount).toBe(-5000);
  });

  test('createTransaction with valid splits sums to parent amount and nulls parent categoryId', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    const tx = await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      return await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: 'ignored-when-splits',
        amount: -8000,
        date: '2026-04-15',
        payee: 'grocery',
        splits: [
          { categoryId: f, amount: -6000, memo: 'produce' },
          { categoryId: h, amount: -2000, memo: 'paper towels' },
        ],
      });
    }, [food, house]);
    expect(tx.categoryId).toBeNull();
    expect(tx.splits.length).toBe(2);
    expect(tx.splits[0].categoryId).toBe(food);
    expect(tx.splits[0].amount).toBe(-6000);
  });

  test('createTransaction rejects splits whose sum does not equal parent amount', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const result = await page.evaluate(async (f) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      try {
        await (window as any).dmBudget.createTransaction({
          accountId: acct.id,
          amount: -8000,
          date: '2026-04-15',
          splits: [{ categoryId: f, amount: -5000 }],
        });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: String(e.message || e) };
      }
    }, food);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/sum/i);
  });

  test('splitTransaction wrapper replaces splits on an existing tx and nulls parent categoryId', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    const travel = await createCategory(page, 'Travel');
    const tx = await page.evaluate(async ([f, h, tr]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      const created = await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: f,
        amount: -10000,
        date: '2026-04-15',
      });
      const updated = await (window as any).dmBudget.splitTransaction(created.id, [
        { categoryId: h, amount: -3000 },
        { categoryId: tr, amount: -7000 },
      ]);
      return updated;
    }, [food, house, travel]);
    expect(tx.categoryId).toBeNull();
    expect(tx.splits.length).toBe(2);
  });

  test('splitTransaction with empty array restores single-category behavior', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    const result = await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      const created = await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        amount: -5000,
        date: '2026-04-15',
        splits: [
          { categoryId: f, amount: -3000 },
          { categoryId: h, amount: -2000 },
        ],
      });
      // Restore by sending splits: [] AND setting categoryId back
      const cleared = await (window as any).dmBudget.updateTransaction(created.id, {
        splits: [],
        categoryId: f,
      });
      return cleared;
    }, [food, house]);
    expect(result.splits).toEqual([]);
    expect(result.categoryId).toBe(food);
  });

  test('getMonthSummary credits each split categoryId, not the parent', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    const summary = await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        amount: -10000,
        date: '2026-04-15',
        splits: [
          { categoryId: f, amount: -6000 },
          { categoryId: h, amount: -4000 },
        ],
      });
      return await (window as any).dmBudget.getMonthSummary('2026-04');
    }, [food, house]);
    const foodRow = summary.categories.find((c: any) => c.id === food);
    const houseRow = summary.categories.find((c: any) => c.id === house);
    expect(foodRow.spent).toBe(6000);
    expect(houseRow.spent).toBe(4000);
  });

  test('parent categoryId is NOT double-counted when splits are present', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    // Manually create a tx with BOTH categoryId AND splits (simulating a legacy-inconsistent state)
    const summary = await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      const created = await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: f,       // splits will null this out
        amount: -10000,
        date: '2026-04-15',
        splits: [
          { categoryId: f, amount: -6000 },
          { categoryId: h, amount: -4000 },
        ],
      });
      // Sanity: parent categoryId should be null now
      const afterCreate = created.categoryId;
      const s = await (window as any).dmBudget.getMonthSummary('2026-04');
      return { afterCreate, summary: s };
    }, [food, house]);
    expect(summary.afterCreate).toBeNull();
    const foodRow = summary.summary.categories.find((c: any) => c.id === food);
    // Food should only receive the split portion (6000), not 6000 + 10000
    expect(foodRow.spent).toBe(6000);
  });

  test('income splits contribute to monthly income total', async ({ page }) => {
    const salary = await createCategory(page, 'Salary', 'income');
    const bonus = await createCategory(page, 'Bonus', 'income');
    const summary = await page.evaluate(async ([s, b]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        amount: 500000,
        date: '2026-04-15',
        splits: [
          { categoryId: s, amount: 400000 },
          { categoryId: b, amount: 100000 },
        ],
      });
      return await (window as any).dmBudget.getMonthSummary('2026-04');
    }, [salary, bonus]);
    expect(summary.income).toBe(500000);
  });

  test('serializer round-trips splits through IDB', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    const stored = await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      const tx = await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        amount: -5000,
        date: '2026-04-15',
        splits: [
          { categoryId: f, amount: -3000, memo: 'A' },
          { categoryId: h, amount: -2000, memo: 'B' },
        ],
      });
      const all = await (window as any).dmBudget.getTransactions({ month: '2026-04' });
      return all.find((t: any) => t.id === tx.id);
    }, [food, house]);
    expect(stored.splits.length).toBe(2);
    expect(stored.splits[0].memo).toBe('A');
    expect(stored.splits[1].memo).toBe('B');
  });
});

test.describe('Split transactions — UI', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });

  test('transaction row has a Split button', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    await page.evaluate(async (f) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: f,
        amount: -5000,
        date: new Date().toISOString().slice(0, 10),
      });
    }, food);
    await page.goto('./docs/budget/transactions/');
    await waitForDmBudget(page);
    const btn = page.locator('[data-tx-split]');
    await expect(btn.first()).toBeVisible();
  });

  test('clicking Split opens an inline panel with two default rows', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    await page.evaluate(async (f) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: f,
        amount: -8000,
        date: new Date().toISOString().slice(0, 10),
      });
    }, food);
    await page.goto('./docs/budget/transactions/');
    await waitForDmBudget(page);
    await page.locator('[data-tx-split]').first().click();
    await expect(page.locator('.dm-tx-split-panel')).toBeVisible();
    const items = page.locator('.dm-tx-split-item');
    await expect(items).toHaveCount(2);
  });

  test('transaction with splits shows a Split badge instead of a category select', async ({ page }) => {
    const food = await createCategory(page, 'Food');
    const house = await createCategory(page, 'Household');
    await page.evaluate(async ([f, h]) => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        amount: -10000,
        date: new Date().toISOString().slice(0, 10),
        splits: [
          { categoryId: f, amount: -6000 },
          { categoryId: h, amount: -4000 },
        ],
      });
    }, [food, house]);
    await page.goto('./docs/budget/transactions/');
    await waitForDmBudget(page);
    const badge = page.locator('.split-badge').first();
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Split');
    await expect(badge).toContainText('2');
  });
});

