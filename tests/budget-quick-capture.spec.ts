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

async function waitForDmBudget(page: Page) {
  await page.waitForFunction(
    () =>
      !!(window as any).dmBudget &&
      typeof (window as any).dmBudget.createTransaction === 'function' &&
      typeof (window as any).dmBudget.ensureDefaultAccount === 'function',
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
  await page.goto('./');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await cleanupAllBudgetStores(page);
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
  await page.waitForFunction(
    () => typeof (window as any).dmQuickCaptureParseExpense === 'function',
    { timeout: 5_000 },
  );
}

// ─────────────────────────────────────────────
// Tests — parseExpenseText (pure parser)
// ─────────────────────────────────────────────

test.describe('Quick Capture Expense — parser', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('parses simple $12.50 coffee', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('$12.50 coffee'),
    );
    expect(r.amount).toBe(-1250);
    expect(r.payee).toBe('coffee');
    expect(r.income).toBe(false);
    expect(r.error).toBeNull();
  });

  test('parses bare number as expense', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('4.50 lunch'),
    );
    expect(r.amount).toBe(-450);
    expect(r.payee).toBe('lunch');
  });

  test('comma decimal (EU-style)', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('3,75 kaffee'),
    );
    expect(r.amount).toBe(-375);
    expect(r.payee).toBe('kaffee');
  });

  test('leading + marks as income', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('+500 salary'),
    );
    expect(r.amount).toBe(50000);
    expect(r.income).toBe(true);
    expect(r.payee).toBe('salary');
  });

  test('yesterday keyword sets date to yesterday', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('4.50 lunch yesterday'),
    );
    const yd = new Date();
    yd.setHours(0, 0, 0, 0);
    yd.setDate(yd.getDate() - 1);
    const y = yd.getFullYear();
    const m = String(yd.getMonth() + 1).padStart(2, '0');
    const d = String(yd.getDate()).padStart(2, '0');
    expect(r.date).toBe(`${y}-${m}-${d}`);
    expect(r.payee).toBe('lunch');
  });

  test('today keyword sets date to today', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('12 coffee today'),
    );
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    expect(r.date).toBe(`${y}-${m}-${d}`);
  });

  test('YYYY-MM-DD date', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('25 groceries 2026-01-15'),
    );
    expect(r.date).toBe('2026-01-15');
    expect(r.amount).toBe(-2500);
    expect(r.payee).toBe('groceries');
  });

  test('MM/DD rolls back to previous year if in the future', async ({ page }) => {
    // Pick a date 1 day in the future to guarantee rollback
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const mm = future.getMonth() + 1;
    const dd = future.getDate();
    const input = `10 test ${mm}/${dd}`;
    const r = await page.evaluate((v) => (window as any).dmQuickCaptureParseExpense(v), input);
    expect(r.date).not.toBeNull();
    // Parsed date must not be strictly in the future (today or earlier)
    const parsedMs = new Date(r.date + 'T00:00:00').getTime();
    const todayMs = new Date().setHours(0, 0, 0, 0);
    expect(parsedMs).toBeLessThanOrEqual(todayMs);
  });

  test('#tag extracted as category hint and stripped from payee', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('12 lunch #food'),
    );
    expect(r.categoryHint).toBe('food');
    expect(r.payee).toBe('lunch');
  });

  test('empty input returns error', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('   '),
    );
    expect(r.error).toBe('empty');
  });

  test('no amount returns error', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('coffee please'),
    );
    expect(r.error).toBe('no-amount');
  });

  test('zero amount returns error', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmQuickCaptureParseExpense('0 nothing'),
    );
    expect(r.error).toBe('no-amount');
  });
});

// ─────────────────────────────────────────────
// Tests — UI integration
// ─────────────────────────────────────────────

test.describe('Quick Capture Expense — UI', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('Expense mode button exists and switches mode', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('#quick-capture-btn') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#quick-capture-modal.active');
    const expenseBtn = page.locator('.qc-mode-btn[data-mode="expense"]');
    await expect(expenseBtn).toBeVisible();
    await expenseBtn.click();
    await expect(page.locator('#qc-expense-fields')).toBeVisible();
    await expect(page.locator('#qc-expense-input')).toBeFocused();
  });

  test('submitting an expense creates a transaction', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('#quick-capture-btn') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#quick-capture-modal.active');
    await page.locator('.qc-mode-btn[data-mode="expense"]').click();
    await page.locator('#qc-expense-input').fill('$7.25 coffee');

    // Preview should reflect parsed amount
    await expect(page.locator('#qc-expense-preview')).toContainText('7.25');

    await page.locator('#qc-submit').click();
    // Success feedback
    await expect(page.locator('#qc-feedback')).toBeVisible({ timeout: 5_000 });

    // Transaction persisted to IDB
    const txs = await getAllIdbRecords(page, 'transactions');
    expect(txs.length).toBe(1);
    expect(txs[0].amount).toBe(-725);
    expect(txs[0].payee).toBe('coffee');
    expect(txs[0].source).toBe('quick-capture');
    expect(txs[0].accountId).toBeTruthy();
  });

  test('income with + prefix creates positive transaction', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('#quick-capture-btn') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#quick-capture-modal.active');
    await page.locator('.qc-mode-btn[data-mode="expense"]').click();
    await page.locator('#qc-expense-input').fill('+100 refund');
    await page.locator('#qc-submit').click();
    await expect(page.locator('#qc-feedback')).toBeVisible({ timeout: 5_000 });

    const txs = await getAllIdbRecords(page, 'transactions');
    expect(txs.length).toBe(1);
    expect(txs[0].amount).toBe(10000);
    expect(txs[0].payee).toBe('refund');
  });

  test('invalid input (no amount) shows error and does not create transaction', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('#quick-capture-btn') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#quick-capture-modal.active');
    await page.locator('.qc-mode-btn[data-mode="expense"]').click();
    await page.locator('#qc-expense-input').fill('coffee please');
    await page.locator('#qc-submit').click();

    await expect(page.locator('#qc-feedback-text')).toContainText(/amount/i, {
      timeout: 5_000,
    });

    const txs = await getAllIdbRecords(page, 'transactions');
    expect(txs.length).toBe(0);
  });

  test('Tab cycles through modes including expense', async ({ page }) => {
    await page.evaluate(() => {
      const btn = document.querySelector('#quick-capture-btn') as HTMLElement;
      btn?.click();
    });
    await page.waitForSelector('#quick-capture-modal.active');
    // Default is AI mode
    await expect(page.locator('.qc-mode-btn.active')).toHaveAttribute('data-mode', 'ai');
    // Tab 4 times: ai → note → code → todo → expense
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('.qc-mode-btn.active')).toHaveAttribute('data-mode', 'expense');
    // One more wraps back to ai
    await page.keyboard.press('Tab');
    await expect(page.locator('.qc-mode-btn.active')).toHaveAttribute('data-mode', 'ai');
  });
});
