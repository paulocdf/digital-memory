# Fix: "Migrate to Today" Button Does Nothing

## Problem

The "Migrate to Today" button in overdue day group headers sometimes does nothing when clicked.

## Root Cause

**File:** `themes/hugo-book/layouts/partials/todo-list.html`

The `migrateGroupToToday()` function (line 4533-4534) filters tasks too restrictively:

```javascript
var tasksToMigrate = allTodos.filter(function(t) {
    return t.scheduledDate === groupDateStr && !t.done && (t.bujoState || 'open') === 'open' && !t.parentId;
});
```

The condition `(t.bujoState || 'open') === 'open'` means only tasks with `bujoState === 'open'` (or undefined) are migrated. But tasks can have:
- `bujoState: 'migrated'` — previously migrated to this date (e.g., migrated forward +1 day to a date that is now also overdue)
- `bujoState: 'scheduled'` — scheduled for this date, which has now passed

Both have `done: false`, so they count as incomplete in the group's progress counter (`doneInGroup < totalInGroup`), causing the button to appear. But when clicked, they're skipped by the filter, so nothing happens.

**Mismatch:**
- **Button visibility** (line 4142): `cssClass === 'overdue' && doneInGroup < totalInGroup` — counts ALL undone tasks
- **Migration filter** (line 4534): only picks tasks with `bujoState === 'open'` — skips migrated/scheduled tasks

## Fix

**One-line change** in `migrateGroupToToday()` at line 4533-4534:

### Before
```javascript
var tasksToMigrate = allTodos.filter(function(t) {
    return t.scheduledDate === groupDateStr && !t.done && (t.bujoState || 'open') === 'open' && !t.parentId;
});
```

### After
```javascript
var tasksToMigrate = allTodos.filter(function(t) {
    return t.scheduledDate === groupDateStr && !t.done && !t.parentId;
});
```

Remove the `bujoState` check entirely. Since `!t.done` already excludes completed tasks, and the function's intent is to migrate ALL remaining open tasks from an overdue day to today, the bujoState filter is unnecessary and causes the bug.

## Verification

After the fix, the following scenario should work:
1. Have a task in an overdue day group with `bujoState: 'migrated'` or `bujoState: 'scheduled'`
2. Click "Migrate to Today"
3. The task should move to today's group with `bujoState: 'migrated'` and `scheduledDate: today`
