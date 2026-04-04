# Task Card Polish — Implementation Plan

## Scope

5 changes in `todo-list.html` (~9,700 lines). All CSS in the `<style>` block, all JS in the `<script>` block.

**Tint priority hierarchy**: user-set `todo.color` > project color > category color > no tint.
**Alpha values**: 0.08-0.12 active, 0.04-0.06 done (stronger than initially proposed).

---

## 1. Fix `.todo-item-project-dot` Missing CSS (Bug Fix)

**Problem**: The `.todo-item-project-dot` span has no CSS dimensions (no width, height, border-radius). The dot is invisible. The kanban version at `kanban-board.html:384-389` properly defines `7px` circle.

### CSS — Add after `.todo-item-category` rule (after line ~2098)

```css
.todo-item-project {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.68rem;
  color: var(--gray-400);
  font-weight: 500;
}
.todo-item-project-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

---

## 2. Fix `getProjectDarkColor()` → Use `dmTaskColors.getColor()`

**Problem**: `getProjectDarkColor()` at line ~4663 only maps 10 of 15 `TASK_COLORS` — missing Lime, Cyan, Brown, Deep Purple, Light Blue. The `dmTaskColors.getColor()` API already handles all 15.

### JS — Replace project dot color line (line ~5152)

**Before:**
```js
var isDark = document.documentElement.classList.contains('dark');
var dotColor = isDark ? (getProjectDarkColor(proj.color) || proj.color) : proj.color;
```

**After:**
```js
var dotColor = window.dmTaskColors ? window.dmTaskColors.getColor(proj.color) : proj.color;
```

Note: Keep `getProjectDarkColor()` function in place (may be used by add-form project chip rendering or elsewhere). Search for other call sites first.

---

## 3. Gradient `::before` Border Accent

**Replace** flat `border-left: 3px solid COLOR` with a gradient `::before` pseudo-element that fades from full color to transparent.

### CSS — Replace lines ~1542-1565

**Remove** from `.todo-item`:
```css
border-left: 3px solid transparent;
```

**Add** to `.todo-item`:
```css
position: relative;
padding-left: 13px; /* was 10px, add 3px for accent */
```

**Add new rules** (replace the old `.priority-*` border-left rules):
```css
.todo-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  border-radius: 1.5px;
  background: transparent;
  transition: background 0.15s;
}
.todo-item.priority-overdue::before {
  background: linear-gradient(to bottom, var(--color-danger, #c62828) 30%, transparent);
}
.todo-item.priority-today::before {
  background: linear-gradient(to bottom, var(--accent-blue, #1a73e8) 30%, transparent);
}
.todo-item.priority-tomorrow::before {
  background: linear-gradient(to bottom, var(--color-success, #2e7d32) 30%, transparent);
}
.todo-item.priority-future::before {
  background: linear-gradient(to bottom, var(--gray-300) 30%, transparent);
}
.todo-item.done::before {
  background: transparent;
}
```

### Today Mode CSS — Adjust card-style override (~line 328)

The Today mode cards have `border: 1px solid` and `border-radius: 8px`. The `::before` needs to respect the card's border-radius:

```css
.todo-list[data-view-mode="today"] .todo-day-group-items .todo-item::before {
  top: 6px;
  bottom: 6px;
  left: 2px;    /* inside the 1px border */
}
```

### Check for padding conflicts

The current `.todo-item` has `padding: 6px 10px`. Changing to `padding-left: 13px` means:
- Old: `border-left: 3px + padding-left: 10px` = 13px total left space
- New: `padding-left: 13px + ::before 3px absolute` = same visual result

Actually wait — the 3px was a border (outside padding), so total left inset was `3px border + 10px padding = 13px`. With `::before` absolutely positioned at `left:0`, and `padding-left: 13px`, the content starts at the same 13px mark. The `::before` overlaps the left 3px of padding. This is correct.

---

## 4. Add Helper Functions

### JS — Add before `buildTodoItemHtml()` (before line ~4955)

```js
// Hash category string to deterministic color from TASK_COLORS palette
function _getCategoryColor(category) {
  if (!category || !window.dmTaskColors) return null;
  var colors = window.dmTaskColors.COLORS;
  if (!colors || !colors.length) return null;
  var hash = 0;
  for (var i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash) + category.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  var idx = Math.abs(hash) % colors.length;
  var isDark = document.documentElement.classList.contains('dark');
  return isDark ? colors[idx].dark : colors[idx].light;
}

// Compute subtle rgba tint from a hex color
function _computeSubtleTint(hexColor, isDone, activeAlpha, doneAlpha) {
  if (!hexColor) return '';
  var display = window.dmTaskColors ? window.dmTaskColors.getColor(hexColor) : hexColor;
  if (!display || display.charAt(0) !== '#') return '';
  var r = parseInt(display.slice(1, 3), 16);
  var g = parseInt(display.slice(3, 5), 16);
  var b = parseInt(display.slice(5, 7), 16);
  var alpha = isDone ? doneAlpha : activeAlpha;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
```

---

## 5. Unified Tint Cascade in `buildTodoItemHtml()`

### JS — Replace lines ~4982-4986

**Before:**
```js
    var html = '<div class="todo-item' + doneClass + justCompletedClass + justAddedClass + stateClass + priorityClass + '" data-todo-id="' + todo.id + '"';
    // Task color background tint
    if (todo.color && window.dmTaskColors) {
      var tint = window.dmTaskColors.tint(todo.color, todo.done, todo.color2);
      if (tint) html += ' style="background:' + tint + '"';
    }
    html += '>';
```

**After:**
```js
    var html = '<div class="todo-item' + doneClass + justCompletedClass + justAddedClass + stateClass + priorityClass + '" data-todo-id="' + todo.id + '"';
    // Card background tint cascade: user color > project color > category color
    var _bgTint = '';
    if (todo.color && window.dmTaskColors) {
      // 1. User-set color (highest priority)
      _bgTint = window.dmTaskColors.tint(todo.color, todo.done, todo.color2);
    } else if (todo.projectId && _projectMap[todo.projectId] && _projectMap[todo.projectId].color) {
      // 2. Project color
      _bgTint = _computeSubtleTint(_projectMap[todo.projectId].color, todo.done, 0.10, 0.05);
    } else if (todo.category) {
      // 3. Category color (hash-based)
      var _catHexColor = _getCategoryColor(todo.category);
      if (_catHexColor) _bgTint = _computeSubtleTint(_catHexColor, todo.done, 0.08, 0.04);
    }
    if (_bgTint) html += ' style="background:' + _bgTint + '"';
    html += '>';
```

Alpha values (stronger as requested):
- User color: unchanged (uses `dmTaskColors.tint()` which has 0.10/0.15 active, 0.04/0.06 done)
- Project color: 0.10 active, 0.05 done
- Category color: 0.08 active, 0.04 done

---

## File Edit Summary

| # | What | Where (approx lines) | Type |
|---|------|----------------------|------|
| 1 | `.todo-item-project` + `.todo-item-project-dot` CSS | After line ~2098 | CSS add |
| 2 | Project dot: `getProjectDarkColor` → `dmTaskColors.getColor()` | Line ~5152 (will shift) | JS edit |
| 3a | Remove `border-left: 3px solid transparent` from `.todo-item` | Line ~1549 | CSS edit |
| 3b | Add `position: relative; padding-left: 13px` to `.todo-item` | Line ~1542 | CSS edit |
| 3c | Add `::before` pseudo-element + gradient priority rules | After `.todo-item` rule | CSS add (replace old rules) |
| 3d | Remove old `.priority-*` `border-left-color` rules | Lines ~1551-1565 | CSS delete |
| 3e | Today mode `::before` adjustment | After line ~328 | CSS add |
| 4 | `_getCategoryColor()` + `_computeSubtleTint()` helpers | Before `buildTodoItemHtml()` | JS add |
| 5 | Unified tint cascade replacing old `todo.color` block | Lines ~4981-4987 | JS replace |

## Verification

1. `hugo server --disableFastRender` — clean build, no errors
2. `npm test` — all 469 tests pass (12 skipped)
3. Visual check: cards show gradient left accent, project dots visible, category tints vary by name, project tints match project color
