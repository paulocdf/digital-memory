# Inbox "Today Focus" UI Overhaul — Implementation Plan

> Branch: `ui-improvements-inbox`
> Primary file: `themes/hugo-book/layouts/partials/todo-list.html`
> Secondary file: `themes/hugo-book/assets/_custom.scss`
> Created: 2026-04-04

---

## Problem Statement

The Inbox page overwhelms the user with temporal pressure — overdue badges, age escalation colors, multi-day sprawl, and dense metadata. The Projects section (especially "day projects") feels calm and focused because it shows a flat task list with a single progress bar, no urgency signals, and bordered card rows. The goal is to bring that focused quality into the Inbox while keeping the full multi-day view accessible.

---

## Phase A: Project Icon Redesign

**Files**: `todo-list.html` (2 SVG locations)

Replace the generic folder icon with a modern "layers" (stacked rectangles) icon at:
- Project filter trigger button in header (line ~19, 13×13)
- Add-form project icon button (line ~109, 14×14)

New icon: stacked-layers design with `stroke-width="1.75"`.

**Estimate**: ~5 min

---

## Phase B: Full-Width Inbox Layout

**Files**: `_custom.scss`

Add after the existing project-list full-width override (~line 225):
```scss
.book-page:has(.todo-list) .markdown {
  width: 100%;
  max-width: 100%;
}
```

The Inbox is the only major app page missing this override. AI, History, Kanban, and Projects all have it. This gives ~250px more horizontal space.

**Estimate**: ~2 min

---

## Phase C: Today Focus Mode (core feature)

**Files**: `todo-list.html` (CSS + JS)

### C1: View Mode Toggle

- Segmented toggle in `.todo-list-header`: **Today** | **All** buttons
- CSS: pill-shaped segmented control with active state highlight
- JS: sets `data-view-mode="today"` or `data-view-mode="all"` on `.todo-list`
- Persist in `localStorage` key `dm-inbox-view-mode` (default: `"all"`)

### C2: Today Mode Rendering Logic

When `viewMode === 'today'`:
- **Hide** the week summary bar
- **Replace** focus dashboard with a simplified progress section (single bar + stats)
- **Today's tasks**: flat list, no day group header — tasks flow directly
- **Overdue tasks**: collapsed group at the bottom ("Overdue · X tasks")
- **Upcoming/Future**: collapsed "Upcoming" group below overdue
- **Backlog**: collapsed at the bottom

### C3: Hybrid Card Style (Today mode only)

CSS scoped under `.todo-list[data-view-mode="today"]`:
- `.todo-item` gets `border: 1px solid var(--gray-200)`, `border-radius: 8px`, `margin-bottom: 4px`, `padding: 8px 12px`
- Two-line layout preserved (title + meta row)
- Meta row reduced: hide age badges, hide finish-at time; keep estimate + category + project
- Action buttons reduced: show only edit, delete, pomo on hover (hide migrate, flashcard, share, archive)

### C4: Simplified Today Progress Bar

Above the task list in Today mode:
- Thin progress bar (accent-colored, project-style)
- Stats line: `"X of Y tasks · Zm tracked · finish ~HH:MM"`
- Reuses data already computed by focus dashboard builder

### C5: Accent Tint Header

In Today mode, `.todo-list-header` gets a subtle accent gradient:
`background: linear-gradient(135deg, accent 6%, transparent 60%)`

**Estimate**: ~90 min

---

## Phase D: Overdue De-escalation

**Files**: `todo-list.html` (CSS + JS)

### D1: Auto-collapse Overdue Group

- Overdue day group defaults to collapsed (header visible with count badge)
- New localStorage key `dm-todo-overdue-auto-collapsed` (default: `"1"`)
- User can still expand manually; explicit toggle overrides the auto-collapse

### D2: "Reschedule to Today" Quick Action

- Small "→ Today" button on the overdue day group header
- Batch-reschedules all overdue tasks to today via `firestoreWrite()` per task

### D3: Soften Age Badge Timing

Push warning thresholds later:
- mild (gray): 0–6 days
- notice (amber): 7–13 days
- warning (orange): 14–29 days
- critical (red): 30+ days

**Estimate**: ~30 min

---

## Phase E: Today Completion Celebration

**Files**: `todo-list.html` (CSS + JS)

When all of today's tasks are done (in Today mode):
- Progress bar fills to 100% green
- Inline celebration below progress: checkmark + "All done for today!" with fade-in + scale animation
- Ring-pop animation fires (already implemented in Phase 2)
- Auto-dismiss after 5 seconds
- No full-screen overlay (calm, not disruptive)

**Estimate**: ~15 min

---

## Execution Order

1. **A** → Project icon (quick win)
2. **B** → Full-width layout (quick win)
3. **C** → Today Focus mode (core feature)
4. **D** → Overdue de-escalation
5. **E** → Completion celebration
6. **Tests** → Hugo build + Playwright E2E (469 tests)

**Total estimate**: ~2.5 hours

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Project icon style | Layers (stacked rectangles) |
| Today Focus approach | Togglable mode (Today \| All) with default "All" |
| Task card style in Today mode | Hybrid — bordered cards with two-line title+meta layout |
| Scope | All 5 phases (A through E) |
