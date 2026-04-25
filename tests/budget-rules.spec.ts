import { test, expect, Page } from '@playwright/test';
import {
  MOCK_USER,
  injectMockAuth,
  cleanupIdb,
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
  'categoryRules',
] as const;

async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () =>
      !!(window as any).dmBudget &&
      typeof (window as any).dmBudget.getCategoryRules === 'function' &&
      typeof (window as any).dmBudget.createCategoryRule === 'function' &&
      typeof (window as any).dmBudget.updateCategoryRule === 'function' &&
      typeof (window as any).dmBudget.deleteCategoryRule === 'function' &&
      typeof (window as any).dmBudget.applyCategoryRules === 'function' &&
      typeof (window as any).dmBudget.bulkApplyRulesToUncategorized === 'function',
    { timeout: 10_000 },
  );
}

async function cleanupAllBudgetStores(page: Page) {
  await page.evaluate(
    ({ stores, dbName, dbVersion }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(stores as string[], 'readwrite');
          (stores as string[]).forEach((s) => tx.objectStore(s).clear());
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e: any) => { db.close(); reject(e.target.error); };
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

// Seed a category and return its id
async function seedCategory(page: Page, name: string, kind: 'expense' | 'income' = 'expense') {
  return await page.evaluate(
    async ({ name, kind }) => {
      const cat = await (window as any).dmBudget.createCategory({ name, kind, color: '#1976d2' });
      return cat.id;
    },
    { name, kind },
  );
}

// ─────────────────────────────────────────────
// _ruleMatchesTx via applyCategoryRules
// ─────────────────────────────────────────────

test.describe('Budget Rules — matching semantics', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test.afterEach(async ({ page }) => { await cleanupAllBudgetStores(page); });

  test('payee-contains is case-insensitive', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'STARBUCKS', categoryId: catId, priority: 10,
      }), catId);
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'starbucks downtown', memo: '' }),
    );
    expect(match?.categoryId).toBe(catId);
  });

  test('payee-equals requires exact match', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-equals', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), catId);
    const noMatch = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'starbucks downtown', memo: '' }),
    );
    expect(noMatch).toBeNull();
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'Starbucks', memo: '' }),
    );
    expect(match?.categoryId).toBe(catId);
  });

  test('memo-contains matches in memo field only', async ({ page }) => {
    const catId = await seedCategory(page, 'Transit');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'memo-contains', pattern: 'uber', categoryId: catId, priority: 10,
      }), catId);
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'CC', memo: 'Uber Eats order' }),
    );
    expect(match?.categoryId).toBe(catId);
    const noMatch = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'Uber', memo: '' }),
    );
    expect(noMatch).toBeNull();
  });

  test('payee-regex matches via RegExp', async ({ page }) => {
    const catId = await seedCategory(page, 'Subs');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-regex', pattern: '^netflix|^hulu$', categoryId: catId, priority: 10,
      }), catId);
    const a = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'Netflix.com', memo: '' }));
    expect(a?.categoryId).toBe(catId);
    const b = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'Hulu', memo: '' }));
    expect(b?.categoryId).toBe(catId);
    const c = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'Disney+', memo: '' }));
    expect(c).toBeNull();
  });

  test('invalid regex returns no match silently (no throw)', async ({ page }) => {
    const catId = await seedCategory(page, 'X');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-regex', pattern: '[invalid(', categoryId: catId, priority: 10,
      }), catId);
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'whatever', memo: '' }),
    );
    expect(match).toBeNull();
  });

  test('priority order: lower priority wins', async ({ page }) => {
    const catA = await seedCategory(page, 'A');
    const catB = await seedCategory(page, 'B');
    await page.evaluate(({ a, b }) => Promise.all([
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'shop', categoryId: a, priority: 50,
      }),
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'shop', categoryId: b, priority: 10,
      }),
    ]), { a: catA, b: catB });
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'cool shop', memo: '' }),
    );
    expect(match?.categoryId).toBe(catB);
  });

  test('disabled rules are skipped', async ({ page }) => {
    const catA = await seedCategory(page, 'A');
    const catB = await seedCategory(page, 'B');
    await page.evaluate(async ({ a, b }) => {
      const r = await (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'shop', categoryId: a, priority: 10,
      });
      await (window as any).dmBudget.updateCategoryRule(r.id, { enabled: false });
      await (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'shop', categoryId: b, priority: 50,
      });
    }, { a: catA, b: catB });
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'cool shop', memo: '' }),
    );
    expect(match?.categoryId).toBe(catB);
  });

  test('soft-deleted rules are skipped', async ({ page }) => {
    const catA = await seedCategory(page, 'A');
    await page.evaluate(async (a) => {
      const r = await (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'shop', categoryId: a, priority: 10,
      });
      await (window as any).dmBudget.deleteCategoryRule(r.id);
    }, catA);
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'cool shop', memo: '' }),
    );
    expect(match).toBeNull();
  });

  test('empty pattern returns no match', async ({ page }) => {
    const catId = await seedCategory(page, 'A');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: '', categoryId: catId, priority: 10,
      }), catId);
    const match = await page.evaluate(() =>
      (window as any).dmBudget.applyCategoryRules({ payee: 'anything', memo: '' }),
    );
    expect(match).toBeNull();
  });
});

// ─────────────────────────────────────────────
// createTransaction integration
// ─────────────────────────────────────────────

test.describe('Budget Rules — createTransaction integration', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test.afterEach(async ({ page }) => { await cleanupAllBudgetStores(page); });

  test('uncategorized tx auto-categorized via rule + appliedRuleId set', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    const ruleId = await page.evaluate(async (catId) => {
      const r = await (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      });
      return r.id;
    }, catId);
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    const tx = await page.evaluate(async (acctId) => {
      const today = new Date().toISOString().substr(0, 10);
      return await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -500,
        date: today, payee: 'Starbucks', memo: '',
      });
    }, acct.id);
    expect(tx.categoryId).toBe(catId);
    expect(tx.appliedRuleId).toBe(ruleId);
  });

  test('tx with explicit categoryId is NOT overridden by a rule', async ({ page }) => {
    const ruleCat = await seedCategory(page, 'RuleTarget');
    const explicitCat = await seedCategory(page, 'Explicit');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), ruleCat);
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    const tx = await page.evaluate(async ({ acctId, catId }) => {
      const today = new Date().toISOString().substr(0, 10);
      return await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: catId, amount: -500,
        date: today, payee: 'Starbucks', memo: '',
      });
    }, { acctId: acct.id, catId: explicitCat });
    expect(tx.categoryId).toBe(explicitCat);
    expect(tx.appliedRuleId).toBeFalsy();
  });

  test('skipRules: true bypasses rule application', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), catId);
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    const tx = await page.evaluate(async (acctId) => {
      const today = new Date().toISOString().substr(0, 10);
      return await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -500,
        date: today, payee: 'Starbucks', memo: '', skipRules: true,
      });
    }, acct.id);
    expect(tx.categoryId).toBeFalsy();
    expect(tx.appliedRuleId).toBeFalsy();
  });

  test('rule match increments matchCount and sets lastMatchedAt', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    const ruleId = await page.evaluate(async (catId) => {
      const r = await (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      });
      return r.id;
    }, catId);
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    await page.evaluate(async (acctId) => {
      const today = new Date().toISOString().substr(0, 10);
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -500,
        date: today, payee: 'Starbucks A', memo: '',
      });
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -300,
        date: today, payee: 'Starbucks B', memo: '',
      });
    }, acct.id);
    // Wait briefly for the fire-and-forget bumps to land
    await page.waitForTimeout(200);
    const rule = await page.evaluate((id) =>
      (window as any).dmBudget.getCategoryRule(id), ruleId);
    expect(rule.matchCount).toBeGreaterThanOrEqual(2);
    expect(rule.lastMatchedAt).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// bulkApplyRulesToUncategorized
// ─────────────────────────────────────────────

test.describe('Budget Rules — bulk apply', () => {
  test.beforeEach(async ({ page }) => { await setup(page); });
  test.afterEach(async ({ page }) => { await cleanupAllBudgetStores(page); });

  test('categorizes uncategorized tx, skips already-categorized', async ({ page }) => {
    const coffeeCat = await seedCategory(page, 'Coffee');
    const otherCat = await seedCategory(page, 'Other');
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    // Seed 3 transactions BEFORE the rule exists, so none are auto-categorized
    await page.evaluate(async ({ acctId, otherCat }) => {
      const today = new Date().toISOString().substr(0, 10);
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -500,
        date: today, payee: 'Starbucks A', memo: '',
      });
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -700,
        date: today, payee: 'Starbucks B', memo: '',
      });
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: otherCat, amount: -100,
        date: today, payee: 'Starbucks C', memo: '',
      });
    }, { acctId: acct.id, otherCat });
    // Now create the rule
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), coffeeCat);
    const result = await page.evaluate(() =>
      (window as any).dmBudget.bulkApplyRulesToUncategorized());
    // 2 uncategorized scanned + matched; 1 already-categorized skipped (filtered out)
    expect(result.scanned).toBe(2);
    expect(result.updated).toBe(2);
  });

  test('skips tx with non-empty splits', async ({ page }) => {
    const coffeeCat = await seedCategory(page, 'Coffee');
    const splitCat = await seedCategory(page, 'Split');
    const acct = await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
    await page.evaluate(async ({ acctId, splitCat }) => {
      const today = new Date().toISOString().substr(0, 10);
      await (window as any).dmBudget.createTransaction({
        accountId: acctId, categoryId: null, amount: -1000,
        date: today, payee: 'Starbucks Split', memo: '',
        splits: [{ categoryId: splitCat, amount: -500, memo: '' },
                 { categoryId: splitCat, amount: -500, memo: '' }],
      });
    }, { acctId: acct.id, splitCat });
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), coffeeCat);
    const result = await page.evaluate(() =>
      (window as any).dmBudget.bulkApplyRulesToUncategorized());
    expect(result.scanned).toBe(0);
    expect(result.updated).toBe(0);
  });
});

// ─────────────────────────────────────────────
// UI smoke tests
// ─────────────────────────────────────────────

test.describe('Budget Rules — UI', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, './docs/budget/rules/');
  });
  test.afterEach(async ({ page }) => { await cleanupAllBudgetStores(page); });

  test('page loads with empty state', async ({ page }) => {
    await expect(page.locator('h1, h2').filter({ hasText: /rules/i }).first()).toBeVisible();
  });

  test('shows seeded rule in table after create', async ({ page }) => {
    const catId = await seedCategory(page, 'Coffee');
    await page.evaluate((catId) =>
      (window as any).dmBudget.createCategoryRule({
        matchType: 'payee-contains', pattern: 'starbucks', categoryId: catId, priority: 10,
      }), catId);
    await page.waitForTimeout(300);
    await expect(page.locator('text=starbucks').first()).toBeVisible();
  });
});
