# Budget & Spreadsheets — Feature Plan

> New top-level section in Digital Memory combining (a) a purpose-built personal
> budgeting app and (b) a generic spreadsheet workspace with a real formula engine.
> Local-first, same dual-write pattern as todos/notes.

---

## 0. Branch / Repo Prep (pre-execution)

- Current branch: `sidebar-customization`
- `main` is up-to-date with `origin/main` but does **not** yet contain the
  `improved-ui-and-customization` branch (4 commits ahead).
- **Action before coding:** rebase current branch onto `improved-ui-and-customization`
  (per user instruction). Run the `submodule-push` workflow at the end.

---

## 1. Scope Summary

| Dimension        | Decision                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| Primary model    | Dual: **Budget app** (envelopes + accounts + transactions) + **Spreadsheets** |
| Use cases        | Track vs limits + historical analytics + forecasting                        |
| Entry            | Manual + CSV import + **Quick Capture AI NLP**                              |
| Integration      | Recurring items surface as todos/reminders                                  |
| Currency         | Single, user-configured                                                     |
| Charts           | 6 types (see §7)                                                            |
| Formulas         | Full engine: cell refs, functions, dependency graph, recalc                 |

Competitive reference points:
- **YNAB** — zero-based envelope budgeting, rollover, age-of-money
- **Mint** — account ledger, category breakdowns, trend charts
- **Copilot/Monarch** — calendar heatmap, forecasting, recurring detection
- **Actual Budget** — local-first envelope budgeting (closest philosophical match)
- **Google Sheets / Excel** — formula engine, cell refs, charts from selections

---

## 2. Data Model

### 2.1 New IndexedDB object stores (bump version 15 → 16)

All stores follow the existing `userId`-scoped, soft-delete (`deletedAt`), dual-write
pattern. Serializers (`serializeXxx`) must be added to `dm-sync.html` — **critical**
per the repeated reminder in `CONVENTIONS.md`.

```javascript
// accounts — where money lives
{
  id, userId, name, type,              // 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'loan'
  currency,                            // inherited from user setting, stored for future multi-currency
  openingBalance, openingDate,
  color, icon,
  archived, order,                     // fractional ordering
  includeInNetWorth,                   // bool (default true; loans are negative)
  createdAt, updatedAt, deletedAt
}

// categories — envelopes / spending categories
{
  id, userId, name, parentId,          // one level of nesting (Food > Groceries)
  kind,                                // 'income' | 'expense' | 'transfer'
  color, icon, order,
  archived, createdAt, updatedAt, deletedAt
}

// budgets — monthly allocation per category (one doc per category per month)
{
  id,                                  // deterministic: `${YYYY-MM}_${categoryId}`
  userId, month,                       // '2026-04'
  categoryId, allocated,               // cents (integer)
  rollover,                            // bool — carry unused into next month
  note,                                // freeform
  createdAt, updatedAt
}

// transactions
{
  id, userId, accountId, categoryId,
  amount,                              // cents, signed: expense = negative, income = positive
  date,                                // 'YYYY-MM-DD' (user's local)
  payee, memo, tags,                   // tags: string[]
  cleared, reconciled,                 // bools
  transferPairId,                      // links two legs of a transfer
  recurringId,                         // source recurring rule
  attachmentIds,                       // receipts (reuse attachments store)
  source,                              // 'manual' | 'ai' | 'csv' | 'recurring'
  createdAt, updatedAt, deletedAt
}

// recurring — rules that spawn transactions (and optionally todos)
{
  id, userId, name,
  accountId, categoryId, amount,
  frequency,                           // 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  interval, byDayOfMonth, byDayOfWeek, // RRULE-lite
  startDate, endDate, nextDueDate,
  autoPost,                            // true = auto-create tx; false = todo reminder + one-click post
  reminderOffsetDays,                  // e.g. 3 = remind 3 days before
  lastPostedDate,
  createdAt, updatedAt, deletedAt
}

// spreadsheets — workbook container
{
  id, userId, title, tags,
  sheetIds,                            // ordered array; sheets stored separately for size
  createdAt, updatedAt, deletedAt
}

// sheets — a single tab of a workbook
{
  id, workbookId, userId, name, index,
  rowCount, colCount,                  // logical size
  cells,                               // sparse map: { "A1": {v, f, fmt, style}, ... }
  columnWidths, rowHeights,            // sparse maps
  frozenRows, frozenCols,
  createdAt, updatedAt
}
```

### 2.2 Serializer whitelist updates (`dm-sync.html`)

Add: `serializeAccount`, `serializeCategory`, `serializeBudget`, `serializeTransaction`,
`serializeRecurring`, `serializeSpreadsheet`, `serializeSheet`.

### 2.3 Firestore security rules (`firestore.rules`)

Mirror the todos pattern: `request.auth.uid == resource.data.userId` for read/write,
with the new collections added explicitly. No sharing in v1.

### 2.4 Money handling

- **Integer cents everywhere** — never floats. Format at display.
- Single currency read from `localStorage['dm-budget-currency']` (default `USD`);
  settings UI exposes a dropdown of ~20 common codes with symbol/locale lookup.
- Amount input parser accepts `12.34`, `$12.34`, `12,34` (locale-aware).

---

## 3. Feature Inventory (common-in-class features)

### 3.1 Core budgeting (YNAB/Actual-inspired)

- **Monthly envelope view**: one row per category, columns = Budgeted | Spent | Remaining | % used, with a progress bar. Grouped by parent category, collapsible.
- **Rollover toggle** per category/month (unused carries forward, or resets to zero).
- **Quick reallocate**: drag amount from one envelope to another within a month (inline +/- widgets).
- **"To Be Budgeted"** banner — income minus allocations for the month.
- **Month switcher** (< April 2026 >) with a mini-sparkline of each category's 6-month trend.
- **Goal per category** (optional): monthly target / save by date / spending cap. Visual indicator on progress bar.
- **Overspend highlight**: red bar + auto-warning toast when a transaction pushes a category over.
- **Copy budget from previous month** / **Apply template**.

### 3.2 Accounts & transactions (Mint-inspired)

- Accounts list with current balance, 30-day sparkline, archive.
- Transaction register per account: date, payee, category, memo, amount, cleared checkbox, running balance.
- Inline edit, multi-select, bulk edit category, bulk delete.
- Split transactions (one tx across multiple categories, amounts must sum).
- Transfers between accounts (auto-creates the paired leg via `transferPairId`).
- **Reconcile flow**: enter statement balance → walk uncleared → mark reconciled.
- Filter by date range, category, payee, amount range, tag, cleared status.
- Search across payee/memo/tags.

### 3.3 Recurring & reminders (Copilot/Monarch-inspired)

- Define recurring rule (rent $1800 on the 1st, Netflix $15.99 monthly, salary biweekly).
- `autoPost=true`: runs a daily scheduler on page load that creates due transactions up to today.
- `autoPost=false`: creates a **todo** via `window.dmSync.putTodo()` with `reminderAt = dueDate - offset`, category `"Bills"`, so it appears in inbox + pomodoro flows. Completing the todo posts the transaction.
- Auto-detection heuristic (v2): scan the last 90 days of transactions for same-payee same-amount patterns and suggest "Make this recurring?"

### 3.4 AI / Quick Capture (leverage `ai-companion.html`)

- Add **5th Quick Capture mode**: "Expense" (key `X` or another tab cycle).
- Natural language parsing (regex + AI fallback, same pattern as today's task NLP):
  - `"Spent $12.45 on lunch at Chipotle"` → amount, category guess (Food), payee, today.
  - `"Paid $80 gas yesterday"` → relative date, amount, Transport.
  - `"Got paid $3200"` → income transaction to default account.
- AI system prompt extension: include current month's budget state + recent transactions, so the assistant can answer *"How much left for groceries?"* and *"How was my spending last week?"*.
- Voice input already wired in AI mode — reuse for "I just spent twelve bucks on coffee".

### 3.5 CSV import

- Column-mapping UI (bank-export CSVs vary): user picks which column is date/amount/payee/memo.
- Duplicate detection (same date + amount + payee within ±3 days).
- Category auto-match from payee (learned rules).
- Import preview with per-row approve/skip.

### 3.6 Analytics & insights

- Spending by category (donut + bar, current vs prior period, like existing dashboard).
- Trend line of daily/weekly/monthly total expense, with moving average.
- Net worth over time (sum of account balances across dates).
- Calendar heatmap of daily spend (GitHub-style, green→red scale).
- Cashflow forecast: project next 90 days = current balance + scheduled recurring − historical average discretionary.
- **Insights cards** (Copilot-style): "You spent 30% more on Dining this month", "Netflix increased from $14 to $16", "First time at this merchant".

### 3.7 Rules / auto-categorization

- "If payee contains X → category Y, tag Z". Stored as simple rule list in IDB.
- Applied on import and on manual transaction creation before save.

### 3.8 Spreadsheet workspace (Excel/Sheets-inspired)

**Workbooks & sheets**
- Workbook list page (like Notes index). Each has multiple sheets (tabs at bottom).
- Sheet grid: virtualized rendering (essential for perf — do NOT render 10k cells).
- Click cell → edit bar with formula input. Double-click → inline edit.
- Column/row resize, freeze rows/cols, hide, insert/delete.
- Cell formatting: bold/italic/underline, color, background, number format (currency / percent / date / 2-decimal / custom).
- Copy/paste (incl. paste-from-Excel: parse tab/newline).
- Undo/redo stack (per-workbook, 100 steps).

**Formula engine**
- Recommended: adopt **HyperFormula** or **Fortune-Sheet's formula engine** (MIT, ~200KB, bundled locally — no npm, just drop in `static/js/vendor/`). Building our own is a 3-month project. Verify license + bundle size before committing; fallback to **formula.js** (looser but smaller) or a hand-rolled Pratt parser limited to the ~50 most common functions (SUM, AVG, IF, VLOOKUP, INDEX/MATCH, arithmetic, date funcs).
- Supported minimum: arithmetic, `SUM`, `AVERAGE`, `COUNT`, `MIN/MAX`, `IF`, `AND/OR/NOT`, `ROUND`, `ABS`, `TODAY`, `DATE`, `YEAR/MONTH/DAY`, `CONCAT`, `LEFT/RIGHT/MID`, `VLOOKUP`, `INDEX`, `MATCH`, `SUMIF`, `COUNTIF`.
- Cell references: `A1`, `$A$1`, `A1:B10`, cross-sheet `Sheet2!A1`.
- Dependency graph + topological recalc on change; circular-ref detection.

**Charts in spreadsheets**
- Select range → Insert Chart → choose type (bar/line/pie/scatter). Chart stored as an overlay object with the sheet.
- Reuse D3 renderers (already bundled).

**Budget ↔ Spreadsheet bridge**
- Virtual function `BUDGET(category, month)` returns allocated/spent/remaining from live budget data — lets users build custom dashboards.
- "Export budget to sheet" action → snapshots current month into a new sheet.

### 3.9 Settings

New settings panel section "Budget":
- Currency (dropdown)
- Start of month (1st / custom day / 15th-to-15th)
- Default account for quick entry
- Rollover default (on/off)
- "Show budget in Quick Capture AI context" (on/off)

---

## 4. UI / Navigation

### 4.1 Pages (all under `content/docs/`)

| Path                       | Shortcode                   | Purpose                               |
| -------------------------- | --------------------------- | ------------------------------------- |
| `/docs/budget/`            | `budget-overview.html`      | Envelope view, month switcher         |
| `/docs/budget/accounts/`   | `accounts-list.html`        | Accounts + balances                   |
| `/docs/budget/accounts/[id]/` | `account-register.html`  | Transaction register                  |
| `/docs/budget/recurring/`  | `recurring-list.html`       | Recurring rules                       |
| `/docs/budget/reports/`    | `budget-reports.html`       | All charts + insights                 |
| `/docs/budget/import/`     | `csv-import.html`           | CSV import wizard                     |
| `/docs/sheets/`            | `sheets-list.html`          | Workbook index                        |
| `/docs/sheets/[id]/`       | `sheet-editor.html`         | Grid + formula bar + charts           |

Add to `content/menu/index.md` — likely a new top-level group "Finance" containing
Budget/Accounts/Recurring/Reports and a separate "Sheets" entry.

### 4.2 Quick Capture

- New tab between AI and Todo: **Expense** (`X` shortcut).
- Fields: amount, payee, category dropdown (typeahead), account, date (defaults today), memo.
- AI mode inherits: typing "spent $X on Y" auto-fills the Expense tab.

### 4.3 Sidebar

- New "Finance" group with Lucide `wallet` icon.
- "Sheets" entry with `table` icon.
- Budget badge: current month's overall % used (color-coded).

---

## 5. Public APIs

Expose via `window.dmBudget` and `window.dmSheets`:

```
window.dmBudget = {
  // CRUD
  createAccount, updateAccount, archiveAccount, getAccounts,
  createCategory, updateCategory, archiveCategory, getCategories,
  createTransaction, updateTransaction, deleteTransaction, getTransactions,
  splitTransaction, createTransfer,
  setBudget(categoryId, month, allocated, rollover),
  // Queries
  getMonthSummary(month), getCategorySpend(categoryId, range),
  getAccountBalance(accountId, asOf), getNetWorthSeries(range),
  getCashflowForecast(days),
  // Recurring
  createRecurring, updateRecurring, deleteRecurring,
  postRecurringDue(), // idempotent scheduler entry point
  // AI
  parseExpense(text), // regex-first, AI fallback — returns {amount, payee, category, date, accountId}
};

window.dmSheets = {
  createWorkbook, updateWorkbook, deleteWorkbook, getWorkbooks,
  createSheet, updateSheet, deleteSheet, getSheet,
  setCell(workbookId, sheetId, ref, {v, f, fmt, style}),
  recalc(workbookId),
  exportCsv(sheetId), importCsv(sheetId, text),
};
```

---

## 6. Events (custom DOM events, per project convention)

- `dm-accounts-updated`, `dm-transactions-updated`, `dm-budget-updated`,
  `dm-recurring-updated`, `dm-sheets-updated`
- `dm-expense-captured` — quick capture fires; reports page re-renders
- `dm-budget-overspend` — payload `{categoryId, month, overBy}` for toast + badge

---

## 7. Charts (all D3, reuse dashboard patterns)

1. **Monthly spend by category** — donut + paired bar, current vs prior month.
2. **Spending trend over time** — line chart, daily/weekly/monthly toggle, 7-day moving avg overlay.
3. **Budget vs actual progress bars** — horizontal bars, overspend in red.
4. **Net worth over time** — line chart across all accounts; stacked area variant by account.
5. **Cashflow forecast** — line split at today; solid past, dashed projection, confidence band from recurring.
6. **Calendar heatmap of daily spend** — 365-day grid, intensity = amount spent, tooltip with details.

All time filters reuse existing dashboard pattern (Today/Week/Month/Year/Custom/All) with period-over-period comparison.

---

## 8. Phased Delivery (recommended)

Scope is large. Suggest shipping in 5 phases — each phase is usable standalone.

### Phase 1 — Foundation & core budget (2 sessions)
- IDB v16 schema + all serializers
- Firestore rules
- Accounts, categories, transactions CRUD (dual-write)
- Monthly envelope view (§3.1 basics: budgeted/spent/remaining, no rollover yet)
- Transaction register
- Manual entry form
- Sidebar nav + content pages
- **Deliverable:** user can manually log expenses and see monthly category progress.

### Phase 2 — Recurring, Quick Capture & AI (1–2 sessions)
- [x] Recurring rules + auto-post scheduler + todo integration
- [x] 5th Quick Capture mode (Expense) with regex NLP
- [x] AI system prompt extension; AI-assisted parsing fallback
- [x] Rollover toggle
- [x] Split transactions (transfers deferred to later phase)
- [x] CSV import wizard
- **Deliverable:** low-friction daily entry + automation.

### Phase 3 — Reports, charts & insights (1–2 sessions)
Sliced into 6 commits — each independently shippable.
- [x] **Slice A** — `/docs/budget/reports/` scaffold + Spending-by-Category donut & bar list with prior-period delta. Helpers: `resolveReportRange`, `priorReportRange`, `getCategorySpend`. Sticky range bar (This month / Last month / Last 3 mo / Last 6 mo / YTD / Custom).
- [x] **Slice B** — Expense trend line chart (D/W/M bucket switcher with moving average — 7-day / 4-week / 3-month). Helper: `getExpenseTrend({from,to,bucket})`. Auto-bucket picks day for ≤45 days, week for ≤180, else month. Hand-rolled SVG line + area + dashed MA + hover tooltip.
- [x] **Slice C** — Calendar heatmap (Sunday-anchored year grid, percentile color scale, year nav). Helper: `getDailySpend({year})` returns `{ year, days[], totalCents, peakCents, avgCents, percentiles, weekCount, firstDow }`. Hand-rolled SVG with hover tooltip.
- [x] **Slice D** — Net worth area chart (since earliest tx) + 90-day cashflow forecast. Helpers: `getNetWorthSeries({from,to,bucket})` (memoized by `{from,to,bucket,maxUpdated,txCount,acctCount}` — self-invalidating on any data change; auto-bucket = day for ≤365 days, else week; respects `includeInNetWorth !== false`; `from` defaults to earliest tx date) + `getCashflowForecast({days,today})` (walks active recurring rules, advances `nextDueDate` via `computeNextDate`, classifies +/− as income/expense, respects `endDate` and `autoPost`). Hand-rolled SVG line+area charts with hover tooltips, stats rows, and empty states.
- [x] **Slice E** — Insights cards (over-spend, on-track-to-overspend pace, first-time payee, subscription drift) with persisted dismissal. Helpers: `computeInsights({month, today, includeDismissed})`, `dismissInsight(id)`, `resetDismissedInsights()`. Dismissed IDs stored in `localStorage['dm-insights-dismissed']`. Severity-tinted cards (alert/warn/info) above Spending-by-Category section; section auto-hides when range preset is not "this-month". Pace insight requires `dayOfMonth >= 5` and is suppressed when category already overspent. Drift threshold: >5% AND ≥100¢ delta vs rule's `amount` (scaled by event count for weekly/daily rules).
- [x] **Slice F** — Auto-categorization rules at `/docs/budget/rules/`. New IDB store `categoryRules` (v19→v20 bump), serializer + Firestore rules; applied automatically on `createTransaction` when `categoryId` is null and there are no splits/recurringId. Match types: `payee-contains`, `payee-equals`, `payee-regex`, `memo-contains`, `memo-equals` (case-insensitive for non-regex; invalid regex returns no match silently). Priority asc + createdAt asc tiebreak; first-match-wins. Disabled and soft-deleted rules skipped. Sets `tx.appliedRuleId`, fire-and-forget bumps `matchCount` + `lastMatchedAt`. Bulk-apply button on the page calls `bulkApplyRulesToUncategorized()`. Test-match panel for previewing rule behavior. APIs: `getCategoryRules({includeDeleted})`, `createCategoryRule()`, `updateCategoryRule()`, `deleteCategoryRule()` (soft delete), `applyCategoryRules(tx)`, `bulkApplyRulesToUncategorized()`. New event `dm-category-rules-updated`.
- **Deliverable:** the analytics story.

**Design decisions for Phase 3** (locked in from approved plan + user feedback):
- Single long-scroll Reports page, not tabs. Sticky range selector at top.
- Default range: This month.
- Net worth starts at user's earliest transaction, with "since {date}" caption.
- Insights dismissal persists across sessions.
- All date math uses calendar arithmetic (`new Date(y, m, d-n)`), never ms subtraction — DST trap.
- Splits credited per-split in aggregations; uncategorized rolled up under a synthetic `null`-id row.
- Charts hand-rolled SVG matching `dashboard.html` style; D3 only if a slice genuinely needs it.

### Phase 4 — Spreadsheet workspace MVP (2–3 sessions)
- Workbook/sheet CRUD + navigation
- Virtualized grid render
- Cell editing, basic formatting
- Formula engine integration (decide: HyperFormula vs hand-rolled) + dependency graph
- Core functions (SUM, AVG, IF, arithmetic, references, ranges)
- Copy/paste, undo/redo
- **Deliverable:** functional sheet like a stripped Google Sheets.

### Phase 5 — Advanced sheets & bridge (1–2 sessions)
- Chart insertion from selections
- `BUDGET()` virtual function
- "Export budget to sheet"
- VLOOKUP/INDEX/MATCH/SUMIF
- Frozen panes, row/col resize, number formats
- CSV import/export per sheet
- **Deliverable:** spreadsheet power features + budget interop.

---

## 9. Testing

- Follow the Playwright pattern in `.context.md`.
- Seed IDB with fixtures (the project-tasks/review specs are the reference).
- Target coverage:
  - `budget-crud.spec.ts` — accounts, categories, transactions, soft-delete
  - `budget-envelope.spec.ts` — allocation, rollover, overspend, progress
  - `budget-recurring.spec.ts` — auto-post, todo creation, idempotency
  - `budget-quick-capture.spec.ts` — NLP parsing of expense strings
  - `budget-import.spec.ts` — CSV mapping + duplicate detection
  - `budget-charts.spec.ts` — reports page renders all 6 charts
  - `sheets-grid.spec.ts` — cell edit, navigation, undo
  - `sheets-formulas.spec.ts` — SUM, IF, refs, cross-sheet, circular detection
  - `sheets-charts.spec.ts` — insert chart from selection
- Verify `serializeXxx()` whitelists via a sync round-trip test.

---

## 10. Risks & Tradeoffs

| Risk                                     | Mitigation                                                     |
| ---------------------------------------- | -------------------------------------------------------------- |
| **Formula engine is huge scope**         | Use HyperFormula (MIT, vendor-bundle). Avoid hand-rolling v1. |
| **Sheet grid perf at 10k+ cells**        | Virtualize rendering; only paint viewport.                    |
| **Float money bugs**                     | Integer cents everywhere; one `formatMoney()` helper.         |
| **AI mis-categorization**                | Always show preview; user confirms; rules learn over time.    |
| **Recurring double-post**                | `lastPostedDate` + `recurringId` + dedup guard.               |
| **Firestore doc size on large sheets**   | Sheet cells may exceed 1MB doc limit. Chunk into `sheetChunks` store if a sheet crosses 500KB serialized. |
| **Privacy of financial data in cloud**   | Offer "local-only" toggle that skips Firestore sync for budget collections. |
| **AGENTS.md / FEATURES.md / .context.md**| Must be updated alongside implementation per project rules.   |

---

## 11. Open Questions (before starting Phase 1)

1. **Local-only mode for financial data?** Some users don't want their finances in Firestore. Want a per-user toggle to keep budget data IDB-only?
2. **Scheduler home for recurring posts.** Run on every page load (simple, possibly laggy), or on a dedicated interval in `dm-sync.html` similar to the 5-min background sync?
3. **Formula engine choice.** Pre-approve HyperFormula (~200KB gzipped), or prefer a hand-rolled minimal parser to keep the no-dep ethos?
4. **Top-level nav label.** "Finance", "Budget", or "Money"? Sidebar icon — `wallet`, `piggy-bank`, or `dollar-sign`?
5. **Multi-account at v1.** Include from Phase 1, or defer (single default account)?
6. **Privacy in AI prompt.** Include transaction detail in AI context, or aggregate only (per-category totals)?
