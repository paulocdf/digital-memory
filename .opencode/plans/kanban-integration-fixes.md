# Kanban Integration Fixes — Implementation Plan

## Overview
11 integration gaps identified between the kanban board and the rest of the Digital Memory project. This plan covers all fixes from critical bugs to nice-to-have enhancements.

---

## Fix #1 — Quick Capture missing kanban fields [CRITICAL]
**File:** `body.html:1582-1601`

Add `kanbanStatus: 'todo'` and `kanbanOrder: orderVal` to the `todoData` object in `submitTodo()`. Extract `Date.now()` into a variable (`orderVal`) so both `order` and `kanbanOrder` use the same value.

```js
// Before: order: Date.now(),
// After:
var orderVal = Date.now();
var todoData = {
  ...
  order: orderVal,
  kanbanStatus: 'todo',
  kanbanOrder: orderVal,
  ...
};
```

---

## Fix #2-3 — Inbox drag sync [MODERATE]
**Files:** `todo-list.html:4617-4645` (handleParentDrop) and `todo-list.html:4664-4684` (handleNestDrop)

Add `kanbanOrder: newOrder` to both the `updates` and `localUpdates` objects, and set `todo.kanbanOrder = newOrder` in the local apply step.

### handleParentDrop (line 4617):
```js
var updates = { order: newOrder, kanbanOrder: newOrder, updatedAt: ... };
var localUpdates = { order: newOrder, kanbanOrder: newOrder, updatedAt: ... };
// line 4640:
todo.order = newOrder;
todo.kanbanOrder = newOrder;
```

### handleNestDrop (line 4664):
```js
var updates = {
  parentId: targetParentId,
  order: newOrder,
  kanbanOrder: newOrder,
  scheduledDate: newScheduledDate,
  updatedAt: ...
};
var localUpdates = {
  parentId: targetParentId,
  order: newOrder,
  kanbanOrder: newOrder,
  scheduledDate: newScheduledDate,
  updatedAt: ...
};
// line 4679:
todo.order = newOrder;
todo.kanbanOrder = newOrder;
```

---

## Fix #4 — Trash restore missing kanban fields [MODERATE]
**File:** `trash-list.html:493-510`

Add `kanbanStatus: 'todo'` and `kanbanOrder: Date.now()` to the Firestore update data in the restore handler.

```js
data: {
  status: 'active',
  bujoState: 'open',
  kanbanStatus: 'todo',
  kanbanOrder: Date.now(),
  deletedAt: firebase.firestore.FieldValue.delete(),
  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
},
```

---

## Fix #5 — BuJo migrated/scheduled don't update kanbanStatus [MODERATE]
**Files:** `todo-list.html:4310-4316`, `kanban-board.html:926-931`, `todo-list.html:3853-3858` (changeBujoState)

When BuJo state changes to `migrated` or `scheduled`, set `kanbanStatus: 'todo'` (since these tasks are still active/open, they should appear in the To Do column, not stay stuck in In Progress).

### todo-list.html edit modal handler (line 4310-4316):
```js
} else {
  // migrated / scheduled — keep active, reset kanban to 'todo'
  firestoreUpdates.done = false;
  firestoreUpdates.status = 'active';
  firestoreUpdates.kanbanStatus = 'todo';
  localUpdates.done = false;
  localUpdates.status = 'active';
  localUpdates.kanbanStatus = 'todo';
}
```

### kanban-board.html edit result handler (line 926-931):
Same pattern — add `kanbanStatus: 'todo'` to both firestore and local updates.

### todo-list.html changeBujoState (line 3853-3858):
Same pattern — add `kanbanStatus: 'todo'` to the migrated/scheduled else branch.

---

## Fix #6 — Export includes kanbanStatus [MODERATE]
**File:** `export-modal.html:634-640` (Markdown) and `1033-1041` (PDF)

### Markdown (todoToMarkdownLine):
Add a kanban status tag when not 'todo' (default):
```js
function todoToMarkdownLine(todo) {
  var check = todo.done ? '[x]' : '[ ]';
  var parts = ['- ' + check + ' ' + (todo.title || 'Untitled')];
  if (todo.kanbanStatus === 'in_progress') parts[0] += ' **[In Progress]**';
  if (todo.category) parts[0] += ' `' + todo.category + '`';
  if (todo.estimatedMin) parts[0] += ' (' + todo.estimatedMin + 'min)';
  return parts[0];
}
```

### PDF (todoItemHtml):
Add kanban status indicator:
```js
function todoItemHtml(t, indent) {
  var cls = t.done ? ' export-print-todo-done' : '';
  var prefix = indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : '';
  var check = t.done ? '&#9745;' : '&#9744;';
  var extra = '';
  if (t.kanbanStatus === 'in_progress') extra += ' <strong>[In Progress]</strong>';
  if (t.category) extra += ' <em>[' + escHtml(t.category) + ']</em>';
  if (t.estimatedMin) extra += ' <em>(' + t.estimatedMin + 'min)</em>';
  return '<div class="export-print-todo' + cls + '">' + prefix + check + ' ' + escHtml(t.title || '') + extra + '</div>';
}
```

---

## Fix #7 — Dashboard kanban metrics [MODERATE]
**File:** `dashboard.html:489-513`

Add two new stat cards after "Tasks Done" (line 493):

1. **In Progress** — count of tasks with `kanbanStatus === 'in_progress'`
2. **Board Throughput** — tasks completed per week (using `completedAt` timestamps from last 30 days)

```js
// After "Tasks Done" card (line 493):
var inProgress = todos.filter(function(t) { return t.kanbanStatus === 'in_progress' && t.status === 'active'; }).length;
html += '<div class="dashboard-stat">';
html += '<div class="dashboard-stat-value">' + inProgress + '</div>';
html += '<div class="dashboard-stat-label">In Progress</div>';
html += '<div class="dashboard-stat-sub">on the board</div>';
html += '</div>';

// Calculate weekly throughput (last 30 days)
var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
var recentDone = todos.filter(function(t) {
  var ca = t.completedAt;
  if (!ca) return false;
  var ts = typeof ca === 'number' ? ca : (ca.seconds ? ca.seconds * 1000 : ca);
  return ts >= thirtyDaysAgo;
});
var weeksSpan = Math.max(1, Math.ceil((Date.now() - thirtyDaysAgo) / (7 * 24 * 60 * 60 * 1000)));
var throughput = recentDone.length > 0 ? Math.round(recentDone.length / weeksSpan * 10) / 10 : 0;
if (throughput > 0) {
  html += '<div class="dashboard-stat">';
  html += '<div class="dashboard-stat-value">' + throughput + '<span style="font-size: 0.8rem; font-weight: 400;">/wk</span></div>';
  html += '<div class="dashboard-stat-label">Throughput</div>';
  html += '<div class="dashboard-stat-sub">tasks done per week (30d)</div>';
  html += '</div>';
}
```

---

## Fix #8 — Edit modal kanban column control [NICE-TO-HAVE]
**Files:** `todo-edit-modal.html` (UI + JS), callers in `todo-list.html` and `kanban-board.html`

### UI — Add a kanban status pill/dropdown in the metadata row (after bujo wrapper, line ~54):
```html
<div class="todo-edit-kanban-wrapper" id="todo-edit-kanban-wrapper">
  <label style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">Board</label>
  <select id="todo-edit-kanban-status" class="todo-edit-kanban-select">
    <option value="todo">To Do</option>
    <option value="in_progress">In Progress</option>
    <option value="done">Done</option>
  </select>
</div>
```

### CSS — Style the select to match the modal's design:
```css
.todo-edit-kanban-select {
  font-size: 0.8rem;
  padding: 4px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--body-font-color);
  cursor: pointer;
}
```

### JS — openModal: populate the select:
```js
// In openModal(), after BuJo type/state setup:
var kanbanSelect = document.getElementById('todo-edit-kanban-status');
if (kanbanSelect) kanbanSelect.value = todo.kanbanStatus || 'todo';
```

### JS — saveAndClose: include kanbanStatus in result:
```js
var result = {
  ...existing fields...,
  kanbanStatus: kanbanSelect ? kanbanSelect.value : undefined
};
```

### Callers — handle kanbanStatus in applyEditResult:
In both `todo-list.html` and `kanban-board.html` edit result handlers, add:
```js
if (result.kanbanStatus && result.kanbanStatus !== (todo.kanbanStatus || 'todo')) {
  firestoreUpdates.kanbanStatus = result.kanbanStatus;
  localUpdates.kanbanStatus = result.kanbanStatus;
  // Sync done/status when changing to/from done via kanban dropdown
  if (result.kanbanStatus === 'done') {
    firestoreUpdates.done = true;
    firestoreUpdates.status = 'done';
    firestoreUpdates.bujoState = 'done';
    firestoreUpdates.completedAt = firebase.firestore.FieldValue.serverTimestamp();
    localUpdates.done = true;
    localUpdates.status = 'done';
    localUpdates.bujoState = 'done';
    localUpdates.completedAt = Date.now();
  } else if ((todo.kanbanStatus || 'todo') === 'done' && result.kanbanStatus !== 'done') {
    firestoreUpdates.done = false;
    firestoreUpdates.status = 'active';
    firestoreUpdates.bujoState = 'open';
    firestoreUpdates.completedAt = null;
    localUpdates.done = false;
    localUpdates.status = 'active';
    localUpdates.bujoState = 'open';
    localUpdates.completedAt = null;
  }
}
```

**Note:** When kanbanStatus changes to 'done' via the dropdown, it should also sync BuJo state to 'done'. When moving away from 'done', it should sync BuJo back to 'open'. This avoids the BuJo/kanban desync issue.

Also: if user changes BuJo state in the same edit, the BuJo handler should take priority (since it already syncs kanbanStatus). The kanbanStatus dropdown handler should only fire when BuJo state didn't change.

---

## Fix #9 — SortableJS touch delay options [MINOR]
**Files:** `kanban-board.html:971-978`, `todo-list.html:4510-4520`, `todo-list.html:4575-4583`

Add touch-specific options to all three SortableJS instances:

```js
delay: 150,
delayOnTouchOnly: true,
touchStartThreshold: 5,
```

These prevent accidental drags on touch devices. `delayOnTouchOnly: true` means the delay only applies to touch events, not mouse — so desktop drag-and-drop stays snappy.

### Kanban board (line ~978, after `swapThreshold: 0.65,`):
```js
delay: 150,
delayOnTouchOnly: true,
touchStartThreshold: 5,
```

### Inbox parent sortable (line ~4519, after `swapThreshold: 0.65,`):
Same three properties.

### Inbox subtask sortable (line ~4583, after `animation: 150,`):
Same three properties.

---

## Fix #10 — Deep linking to cards [NICE-TO-HAVE]
**File:** `kanban-board.html`

### On render — check URL hash and focus card:
After `renderBoard()` completes, check if `window.location.hash` matches a todo ID and focus that card:

```js
// At the end of renderBoard():
if (window.location.hash) {
  var hashId = window.location.hash.slice(1); // remove '#'
  var matchCard = container.querySelector('.kanban-card[data-todo-id="' + hashId + '"]');
  if (matchCard) {
    setFocusedCard(hashId);
    matchCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
```

### On card focus — update URL hash (without triggering scroll):
```js
// In setFocusedCard():
if (todoId) {
  history.replaceState(null, '', '#' + todoId);
} else {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
```

### Link from other views:
In `todo-list.html`, could add a "View on Board" link/icon for tasks, linking to `/docs/board/#<todoId>`.

---

## Fix #11 — Export group-by-column option [NICE-TO-HAVE]
**File:** `export-modal.html`

### UI — Add a "Group by" toggle in the options section (after line 117):
```html
<label class="export-option">
  <input type="checkbox" id="export-group-by-kanban">
  <span>Group by board column (instead of date)</span>
</label>
```

### JS — todosToMarkdown: add alternate grouping path:
```js
function todosToMarkdown(todos, includeMetadata) {
  var groupByKanban = document.getElementById('export-group-by-kanban');
  if (groupByKanban && groupByKanban.checked) {
    return todosToMarkdownByKanban(todos, includeMetadata);
  }
  // ... existing date-based grouping ...
}

function todosToMarkdownByKanban(todos, includeMetadata) {
  var subtaskMap = {};
  todos.forEach(function(t) {
    if (t.parentId) {
      if (!subtaskMap[t.parentId]) subtaskMap[t.parentId] = [];
      subtaskMap[t.parentId].push(t);
    }
  });
  Object.keys(subtaskMap).forEach(function(pid) {
    subtaskMap[pid].sort(function(a, b) { return (a.kanbanOrder || 0) - (b.kanbanOrder || 0); });
  });

  var columns = { todo: [], in_progress: [], done: [] };
  todos.forEach(function(t) {
    if (t.parentId) return;
    var col = t.kanbanStatus || 'todo';
    if (!columns[col]) columns[col] = [];
    columns[col].push(t);
  });

  var labels = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
  var lines = ['# Tasks (Board View)'];
  if (includeMetadata) {
    lines.push('');
    lines.push('> ' + todos.length + ' total, ' + columns.done.length + ' completed');
  }

  ['todo', 'in_progress', 'done'].forEach(function(col) {
    lines.push('');
    lines.push('## ' + labels[col] + ' (' + columns[col].length + ')');
    columns[col].sort(function(a, b) { return (a.kanbanOrder || 0) - (b.kanbanOrder || 0); });
    columns[col].forEach(function(t) {
      lines.push(todoToMarkdownLine(t));
      if (subtaskMap[t.id]) {
        subtaskMap[t.id].forEach(function(st) {
          lines.push('  ' + todoToMarkdownLine(st));
        });
      }
    });
  });
  return lines.join('\n');
}
```

### Same pattern for todosToHtml (PDF):
Add a `todosToHtmlByKanban()` function with the same column-based grouping, called when the checkbox is checked.

---

## Implementation Order
1. **#1** Quick Capture fix (critical bug, 1 file, ~5 lines)
2. **#2-3** Inbox drag sync (moderate bug, 1 file, ~6 lines)
3. **#4** Trash restore fix (moderate bug, 1 file, ~2 lines)
4. **#5** BuJo state sync (moderate bug, 3 locations across 2 files, ~6 lines each)
5. **#9** Touch drag options (minor, 3 locations across 2 files, ~3 lines each)
6. **#6** Export kanban status (moderate enhancement, 1 file, ~4 lines)
7. **#7** Dashboard metrics (moderate enhancement, 1 file, ~25 lines)
8. **#8** Edit modal kanban control (nice-to-have, 3 files, ~50 lines total)
9. **#10** Deep linking (nice-to-have, 1 file + optional link from inbox, ~15 lines)
10. **#11** Export group-by-column (nice-to-have, 1 file, ~50 lines)

## Estimated Total: ~170 lines of changes across 5 files
