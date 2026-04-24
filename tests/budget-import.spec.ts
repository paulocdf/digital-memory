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
      typeof (window as any).dmBudget.createTransaction === 'function' &&
      typeof (window as any).dmBudget.ensureDefaultAccount === 'function',
    { timeout: 10_000 },
  );
}

async function waitForImportParser(page: Page) {
  await page.waitForFunction(
    () =>
      typeof (window as any).dmBudgetParseCsv === 'function' &&
      typeof (window as any).dmBudgetParseMoney === 'function' &&
      typeof (window as any).dmBudgetParseDate === 'function' &&
      typeof (window as any).dmBudgetAutoDetectMapping === 'function' &&
      typeof (window as any).dmBudgetIsDuplicate === 'function',
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
  await page.goto('./docs/budget/import/');
  await waitForDmSync(page);
  await waitForDmBudget(page);
  await waitForImportParser(page);
  await cleanupAllBudgetStores(page);
  await page.evaluate(() => (window as any).dmBudget.ensureDefaultAccount());
}

// ─────────────────────────────────────────────
// CSV parser
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — parseCsv', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('parses simple CSV with header', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Amount,Payee\n2026-04-01,-12.50,Coffee\n2026-04-02,-45.00,Groceries'),
    );
    expect(r.headers).toEqual(['Date', 'Amount', 'Payee']);
    expect(r.rows).toEqual([
      ['2026-04-01', '-12.50', 'Coffee'],
      ['2026-04-02', '-45.00', 'Groceries'],
    ]);
  });

  test('handles quoted fields with commas', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Amount,Payee\n2026-04-01,-12.50,"Joe\'s Cafe, Downtown"'),
    );
    expect(r.rows[0]).toEqual(['2026-04-01', '-12.50', "Joe's Cafe, Downtown"]);
  });

  test('handles escaped double quotes', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Payee\n2026-04-01,"Bob ""The Builder"" Inc"'),
    );
    expect(r.rows[0]).toEqual(['2026-04-01', 'Bob "The Builder" Inc']);
  });

  test('handles newlines inside quoted fields', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Memo\n2026-04-01,"Line one\nLine two"'),
    );
    expect(r.rows[0]).toEqual(['2026-04-01', 'Line one\nLine two']);
  });

  test('handles \\r\\n line endings', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Amount\r\n2026-04-01,-12.50\r\n2026-04-02,-45.00\r\n'),
    );
    expect(r.rows.length).toBe(2);
    expect(r.rows[1]).toEqual(['2026-04-02', '-45.00']);
  });

  test('strips trailing empty row', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('Date,Amount\n2026-04-01,-12.50\n\n'),
    );
    expect(r.rows.length).toBe(1);
  });

  test('respects firstRowIsHeader=false', async ({ page }) => {
    const r = await page.evaluate(() =>
      (window as any).dmBudgetParseCsv('2026-04-01,-12.50\n2026-04-02,-45.00', { firstRowIsHeader: false }),
    );
    expect(r.headers).toBeNull();
    expect(r.rows.length).toBe(2);
  });
});

// ─────────────────────────────────────────────
// parseMoneyToCents
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — parseMoneyToCents', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('parses common money formats', async ({ page }) => {
    const cases: [string, number | null][] = [
      ['12.50', 1250],
      ['-12.50', -1250],
      ['$12.50', 1250],
      ['$1,234.56', 123456],
      ['(45.00)', -4500],
      ['12.50-', -1250],
      ['+500', 50000],
      ['3,75', 375],          // comma decimal (European)
      ['1.234,56', 123456],   // European thousand separator + comma decimal
      ['', null],
      ['abc', null],
      ['0.99', 99],
      ['100', 10000],
    ];
    for (const [input, expected] of cases) {
      const got = await page.evaluate((s) => (window as any).dmBudgetParseMoney(s), input);
      expect(got, `input="${input}"`).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────
// parseDateToYmd
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — parseDateToYmd', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('parses common date formats', async ({ page }) => {
    const cases: [string, string | null][] = [
      ['2026-04-01', '2026-04-01'],
      ['2026/04/01', '2026-04-01'],
      ['04/01/2026', '2026-04-01'],   // US default
      ['4/1/2026', '2026-04-01'],
      ['13/04/2026', '2026-04-13'],   // day-first heuristic (13>12)
      ['4/1/26', '2026-04-01'],       // 2-digit year
      ['2026-04-01 12:34:56', '2026-04-01'],
      ['2026-04-01T12:34', '2026-04-01'],
      ['', null],
      ['notadate', null],
      ['2026-13-01', null],           // invalid month
    ];
    for (const [input, expected] of cases) {
      const got = await page.evaluate((s) => (window as any).dmBudgetParseDate(s), input);
      expect(got, `input="${input}"`).toBe(expected);
    }
  });
});

// ─────────────────────────────────────────────
// autoDetectMapping
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — autoDetectMapping', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('detects standard headers', async ({ page }) => {
    const m = await page.evaluate(() =>
      (window as any).dmBudgetAutoDetectMapping(['Date', 'Amount', 'Payee', 'Memo', 'Category']),
    );
    expect(m).toEqual({ date: 0, amount: 1, payee: 2, memo: 3, category: 4 });
  });

  test('detects bank-style synonyms', async ({ page }) => {
    const m = await page.evaluate(() =>
      (window as any).dmBudgetAutoDetectMapping(['Posted Date', 'Description', 'Amount', 'Notes']),
    );
    expect(m.date).toBe(0);
    expect(m.payee).toBe(1);
    expect(m.amount).toBe(2);
    expect(m.memo).toBe(3);
  });

  test('returns -1 for missing fields', async ({ page }) => {
    const m = await page.evaluate(() =>
      (window as any).dmBudgetAutoDetectMapping(['Foo', 'Bar']),
    );
    expect(m).toEqual({ date: -1, amount: -1, payee: -1, memo: -1, category: -1 });
  });
});

// ─────────────────────────────────────────────
// isDuplicate
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — isDuplicate', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('flags exact match within ±3 days', async ({ page }) => {
    const dup = await page.evaluate(() => {
      const existing = [{ amount: -1250, payee: 'Coffee', date: '2026-04-01', deletedAt: null }];
      const row = { amount: -1250, payee: 'COFFEE', date: '2026-04-03' };
      return (window as any).dmBudgetIsDuplicate(row, existing);
    });
    expect(dup).toBe(true);
  });

  test('does NOT flag if outside ±3 day window', async ({ page }) => {
    const dup = await page.evaluate(() => {
      const existing = [{ amount: -1250, payee: 'Coffee', date: '2026-04-01', deletedAt: null }];
      const row = { amount: -1250, payee: 'Coffee', date: '2026-04-10' };
      return (window as any).dmBudgetIsDuplicate(row, existing);
    });
    expect(dup).toBe(false);
  });

  test('does NOT flag different amount', async ({ page }) => {
    const dup = await page.evaluate(() => {
      const existing = [{ amount: -1250, payee: 'Coffee', date: '2026-04-01', deletedAt: null }];
      const row = { amount: -1500, payee: 'Coffee', date: '2026-04-01' };
      return (window as any).dmBudgetIsDuplicate(row, existing);
    });
    expect(dup).toBe(false);
  });

  test('does NOT flag different payee', async ({ page }) => {
    const dup = await page.evaluate(() => {
      const existing = [{ amount: -1250, payee: 'Coffee', date: '2026-04-01', deletedAt: null }];
      const row = { amount: -1250, payee: 'Tea', date: '2026-04-01' };
      return (window as any).dmBudgetIsDuplicate(row, existing);
    });
    expect(dup).toBe(false);
  });

  test('skips deleted existing transactions', async ({ page }) => {
    const dup = await page.evaluate(() => {
      const existing = [{ amount: -1250, payee: 'Coffee', date: '2026-04-01', deletedAt: 12345 }];
      const row = { amount: -1250, payee: 'Coffee', date: '2026-04-01' };
      return (window as any).dmBudgetIsDuplicate(row, existing);
    });
    expect(dup).toBe(false);
  });
});

// ─────────────────────────────────────────────
// End-to-end UI import
// ─────────────────────────────────────────────

test.describe('Budget CSV Import — UI end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
  });
  test.afterEach(async ({ page }) => {
    await cleanupAllBudgetStores(page);
  });

  test('parses CSV and imports transactions to IDB', async ({ page }) => {
    const csv = [
      'Date,Amount,Payee,Memo',
      '2026-04-01,-12.50,Coffee Shop,Morning latte',
      '2026-04-02,-45.00,Grocery Store,Weekly run',
      '2026-04-03,2000.00,Salary,April paycheck',
    ].join('\n');

    await page.fill('#dm-imp-csv', csv);
    await page.click('#dm-imp-parse');

    // Step 2 visible
    await expect(page.locator('#dm-imp-step-2')).toBeVisible();
    // Step 3 visible after auto-mapping triggers preview
    await expect(page.locator('#dm-imp-step-3')).toBeVisible();

    // Preview should show 3 rows
    await expect(page.locator('#dm-imp-preview tbody tr')).toHaveCount(3);

    // Click import
    await page.click('#dm-imp-import');

    // Wait for success message
    await expect(page.locator('#dm-imp-result-box .dm-imp-result')).toContainText('3 transactions imported', { timeout: 10_000 });

    // Verify IDB
    const txs = await getAllIdbRecords(page, 'transactions');
    expect(txs.length).toBe(3);
    const amounts = txs.map((t: any) => t.amount).sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([-4500, -1250, 200000]);
    const sources = txs.map((t: any) => t.source);
    expect(sources.every((s: string) => s === 'csv-import')).toBe(true);
  });

  test('flags duplicates against existing IDB transactions', async ({ page }) => {
    // Seed an existing transaction
    await page.evaluate(async () => {
      const acct = await (window as any).dmBudget.ensureDefaultAccount();
      await (window as any).dmBudget.createTransaction({
        accountId: acct.id,
        categoryId: null,
        amount: -1250,
        date: '2026-04-01',
        payee: 'Coffee Shop',
      });
    });

    const csv = 'Date,Amount,Payee\n2026-04-02,-12.50,Coffee Shop\n2026-04-05,-45.00,Groceries';
    await page.fill('#dm-imp-csv', csv);
    await page.click('#dm-imp-parse');

    await expect(page.locator('#dm-imp-step-3')).toBeVisible();
    // Wait for duplicate detection (async)
    await expect(page.locator('#dm-imp-preview .badge-dup')).toHaveCount(1, { timeout: 5_000 });

    // Summary reflects 1 duplicate
    await expect(page.locator('#dm-imp-summary')).toContainText('1');
  });

  test('respects sign convention toggle', async ({ page }) => {
    const csv = 'Date,Amount,Payee\n2026-04-01,12.50,Coffee\n';
    await page.fill('#dm-imp-csv', csv);
    await page.click('#dm-imp-parse');
    await expect(page.locator('#dm-imp-step-3')).toBeVisible();

    // Default (sign-negative ON): positive 12.50 stays positive (income-like)
    let amt = await page.locator('#dm-imp-preview tbody tr td.amt').first().textContent();
    expect(amt).toContain('12.50');

    // Toggle off: positive becomes expense
    await page.uncheck('#dm-imp-sign-negative');
    await expect(page.locator('#dm-imp-preview tbody tr td.amt .neg')).toBeVisible();
  });
});
