# Inbox Clarity & Focus Improvements

> Goal: Bring the same sense of focus, progress, and actionability that the Project Detail view provides to the Inbox page.
>
> Approach: Implement one improvement at a time, review each before proceeding to the next.
>
> Status: Planning

---

## 1. Today's Focus Dashboard

**Status**: Not started

### Problem
The Inbox header is minimal -- just "Tasks" with a tiny 22px progress ring. There's no at-a-glance summary of what today looks like: how many tasks, how much time, when you'll finish, what's overdue. You have to mentally assemble this from scattered day group headers.

### Solution
Add a rich summary panel below the header bar (above the add-task form) that acts as a "mini project-detail view" for today:

```
┌─────────────────────────────────────────────────────────┐
│  Today · Wed, Apr 3                                     │
│  ████████████░░░░░░░░  5/8 tasks (62%)                  │
│  2.1h tracked · 1.4h left · finish ~15:30               │
│  🔴 3 overdue  ·  📅 12 upcoming                        │
└─────────────────────────────────────────────────────────┘
```

### Design Details
- **Progress bar**: Full-width, blue fill matching `--accent-color`, same style as project detail progress bar
- **Percentage**: Calculated from today's parent tasks (leaf counting, same as day group headers)
- **Time row**: "Xh tracked" (sum of `actualMin` for done today tasks) + "Xh left" (sum of `estimatedMin` for undone today tasks) + "finish ~HH:MM" (current time + remaining estimate, accounting for active timer)
- **Badges row**: Overdue count (red, clickable to scroll to overdue section) + Upcoming count (tasks scheduled for tomorrow and beyond)
- **Collapsible**: Can be dismissed/collapsed via a small chevron, state persisted to localStorage `dm-todo-focus-dashboard`
- **Updates live**: Re-renders on `dm-todos-updated`, `dm-pomodoro-state-changed`, and every 60s (for finish time accuracy)
- **Hidden when no tasks**: Entire panel hidden if no tasks exist at all

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Add dashboard rendering in `render()`, after header and before add-form
- `themes/hugo-book/assets/_custom.scss`: Add dashboard styles

### Estimated effort
Medium -- ~150 lines of JS, ~60 lines of SCSS

---

## 2. Day Group Progress Bars

**Status**: Not started

### Problem
Day group headers show raw counts ("3/5") which don't convey progress at a glance. Project cards have animated progress bars that immediately communicate how far along you are.

### Solution
Add a small progress bar to each day group header, next to the count text.

### Design Details
- **Bar dimensions**: 60px wide, 4px tall, rounded corners (same proportions as project card progress bars)
- **Colors**: Today = `--accent-color` (blue), Overdue = `#e53935` (red), Tomorrow = `#43a047` (green), Future = `#9e9e9e` (gray)
- **Count format**: Change from "3/5" to "3/5 (60%)" -- add percentage for groups with 3+ tasks
- **Animation**: Fill animates on render using `requestAnimationFrame` (matches project card pattern)
- **All-done state**: Bar fill turns green, group header gets a subtle green tint

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Modify `buildDayGroup()` header HTML
- `themes/hugo-book/assets/_custom.scss`: Add progress bar styles in day group header

### Estimated effort
Small -- ~40 lines of JS, ~30 lines of SCSS

---

## 3. Hide Completed Toggle

**Status**: Not started

### Problem
Done tasks stay inline in the list at 0.6 opacity. There's no way to hide them. In a busy day, completed tasks clutter the view and dilute focus on what's left. Projects have a dedicated "Show/Hide completed" button.

### Solution
Add a "Hide completed" toggle button to the Inbox header bar (right side, next to the project filter).

### Design Details
- **Button**: Compact icon button with a checkmark-eye icon. Tooltip: "Hide completed" / "Show completed"
- **Badge**: Shows count of hidden completed tasks when active (e.g., "5 hidden")
- **Behavior**: When active, all tasks with `done === true` (or `bujoState === 'done'`) are filtered out from render. Day groups that become empty after filtering are also hidden.
- **Scope**: Global toggle affecting all day groups. No per-group toggle (keeps it simple).
- **Persistence**: Stored in localStorage `dm-todo-hide-completed` (boolean)
- **Keyboard shortcut**: `H` key toggles (when not in an input field)
- **Interaction with archive**: The "Archive all" bar still shows at the bottom when completed tasks exist, even if hidden

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Add toggle button in header, add filter logic in `render()`
- `themes/hugo-book/assets/_custom.scss`: Button styles

### Estimated effort
Small -- ~50 lines of JS, ~20 lines of SCSS

---

## 4. Smart Day Group Time Summary

**Status**: Not started

### Problem
Estimated finish times exist per-task (shown in meta row) but the day group header shows no time summary. You can't glance at a group and know "this block is 3.5 hours of work, I'll finish at 17:30." You have to mentally add up individual task estimates.

### Solution
Add a compact time summary to each day group header, next to the progress count.

### Design Details
- **Format**: `Est: 2.5h | Tracked: 1.2h | ~15:30` for today's group
- **Format for other groups**: `Est: 2.5h | Tracked: 1.2h` (no finish time since it depends on completing earlier groups)
- **Calculation**: Sum `estimatedMin` of undone tasks in group for "Est", sum `actualMin` of done tasks for "Tracked"
- **Finish time for today**: Current time + total estimated minutes of undone tasks in today's group, minus elapsed time on active timer (same calculation as existing per-task finish times, but aggregated)
- **Visual**: Smaller font size (0.75rem), muted color, right-aligned in the header row
- **Zero case**: If all tasks in a group have `estimatedMin === 0`, time summary is hidden (no fake "0h" display)
- **Updates live**: Recalculated on `dm-pomodoro-state-changed` and `dm-todos-updated`

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Modify `buildDayGroup()` to compute and render time summary
- `themes/hugo-book/assets/_custom.scss`: Time summary styles

### Estimated effort
Small-Medium -- ~60 lines of JS, ~20 lines of SCSS

---

## 5. Overdue Attention Section

**Status**: Not started

### Problem
Overdue tasks are grouped under their original scheduled date with a subtle red left-border and small "Overdue" badge. Past day groups auto-collapse when all tasks are done, which is good -- but overdue groups with open tasks can also be collapsed by the user and forgotten. There's no persistent, prominent reminder.

### Solution
Consolidate all overdue tasks into a single, visually distinct section at the very top of the task list (before today's group).

### Design Details
- **Section header**: `"⚠ X tasks overdue"` with a red-tinted background (`rgba(229, 57, 53, 0.08)`), red left border (3px)
- **Tasks rendered inside**: All tasks from past day groups that have `done === false` and `scheduledDate < today`
- **Grouping within**: Sub-grouped by original date (so you can see "from Monday", "from last week"), but collapsed into a single scrollable section
- **Actions**: "Migrate all to today" button (batch operation, moves all overdue to today's date) and "Review" button (scrolls/expands each overdue task one at a time)
- **Cannot be collapsed**: Always visible if overdue tasks exist (but can be "dismissed" for the session via an X button, stored in sessionStorage)
- **Original day groups**: Overdue tasks are MOVED from their original day groups into this section (not duplicated). Day groups that become empty after extraction are hidden.
- **Interaction with day group headers**: The old day group "Migrate to Today" button remains for individual groups. The overdue section offers a batch alternative.

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Modify `render()` to extract overdue tasks before day group rendering, add new section builder
- `themes/hugo-book/assets/_custom.scss`: Overdue section styles

### Estimated effort
Medium -- ~120 lines of JS, ~50 lines of SCSS

---

## 6. Week Summary Interactivity

**Status**: Not started

### Problem
The week summary bar (Mon-Sun progress strip) is purely decorative. Clicking a day does nothing. No tooltips. It doesn't drive any action.

### Solution
Make the week bar interactive and actionable.

### Design Details
- **Click to scroll**: Clicking a day column smooth-scrolls to that day group in the task list (or expands it if collapsed). If the day has no tasks, nothing happens.
- **Hover tooltip**: Shows detailed summary on hover: "Wednesday, Apr 3 | 5/8 tasks (62%) | Est: 3.2h | Tracked: 1.8h"
- **Today pulse**: Add a subtle CSS pulse animation to today's column indicator (a small dot below the bar)
- **Overdue indicator**: Days with overdue open tasks get a red dot indicator on the bar
- **Click-to-add**: Double-clicking a future day opens the add-task form with that date pre-filled
- **Cursor**: `pointer` on days with tasks, `default` on empty days

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Add click handlers, tooltip rendering, and scroll logic
- `themes/hugo-book/assets/_custom.scss`: Tooltip, pulse animation, cursor styles

### Estimated effort
Small-Medium -- ~80 lines of JS, ~40 lines of SCSS

---

## 7. Task Age Indicators

**Status**: Not started

### Problem
There's no visibility into how long a task has been sitting. Tasks that were created a month ago look identical to tasks created today. Stale tasks accumulate and contribute to the feeling of being overwhelmed. Kanban cards already show age ("2d", "1w") with urgency coloring.

### Solution
Add a small age badge to task rows in the Inbox, reusing the kanban card age logic.

### Design Details
- **Badge**: Small text after the task title or in the meta row: "2d", "1w", "3w", "1m+"
- **Calculation**: `Math.floor((Date.now() - task.createdAt) / (1000 * 60 * 60 * 24))` days since creation
- **Urgency coloring**: < 3 days = no badge, 3-7 days = muted gray, 1-2 weeks = subtle amber, 2+ weeks = orange, 1+ month = red
- **Only shown for undone tasks**: Done tasks don't need age indicators
- **Position**: In the meta row, after category tag (or after project indicator)
- **Tooltip**: Full date on hover ("Created Mon, Mar 3")
- **Opt-in**: Can be toggled off via a setting in the settings panel (localStorage `dm-todo-show-age`)

### Files to modify
- `themes/hugo-book/layouts/partials/todo-list.html`: Add age badge in `buildTodoItemHtml()`
- `themes/hugo-book/assets/_custom.scss`: Age badge styles with urgency colors
- `themes/hugo-book/layouts/partials/docs/inject/body.html`: Add toggle to settings panel (optional)

### Estimated effort
Small -- ~40 lines of JS, ~25 lines of SCSS

---

## Implementation Order (suggested)

1. **Hide Completed Toggle** -- smallest scope, immediate decluttering value
2. **Day Group Progress Bars** -- small scope, big visual impact
3. **Smart Day Group Time Summary** -- builds on progress bars, adds time context
4. **Today's Focus Dashboard** -- medium scope, ties everything together at the top
5. **Overdue Attention Section** -- medium scope, addresses task neglect
6. **Week Summary Interactivity** -- small-medium scope, polishes existing feature
7. **Task Age Indicators** -- small scope, optional polish

Total estimated: ~540 lines JS, ~245 lines SCSS across all 7 improvements.

---

## Notes

- All improvements follow existing patterns: inline JS in Hugo partial, SCSS in `_custom.scss`, localStorage for persistence, `firestoreWrite()` for any data mutations
- No new IDB stores or Firestore fields needed for any of these
- All are purely additive -- no existing features are removed or changed
- Each can be tested manually and via existing Playwright navigation/responsive tests
