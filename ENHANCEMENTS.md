# Visual & Configuration Enhancements

> Planned UI/UX improvements across Inbox, Projects, Flashcards, and Pomodoro Timer.
>
> Status key: `[ ]` pending, `[~]` in progress, `[x]` done

## 1. Inbox Tasks

- [x] **A — Card flip animation for flashcard creation**: When creating a flashcard from a task, animate the task row "flipping" into a card.
- [x] **D — Priority color bands**: Left border color on task rows based on urgency (overdue = red, today = blue, future = gray).
- [x] **E — Smooth task reorder animations**: FLIP-style animations when tasks move between day groups (enter/exit transitions on group changes).
- [x] **F — Daily progress ring**: Small circular SVG progress indicator in the Inbox header showing today's task completion percentage.
- [x] **G — Keyboard shortcut hints overlay**: A `?` button (or `?` key) that opens a modal listing all available keyboard shortcuts.

## 2. Projects

- [x] **H — Animated progress bar on cards**: Project card progress bars fill with a smooth CSS animation on page load instead of appearing instantly.
- [x] **J — Project color theme**: When viewing a project detail, tint the header area and progress bar with the project's assigned color.
- [x] **K — Drag-and-drop project reordering**: Allow reordering project cards in the grid view via drag-and-drop (uses existing SortableJS dependency).
- [x] **L — Project deadline countdown badge**: "3 days left" or "Overdue" badge on project cards with approaching/past deadlines.
- [x] **M — Project completion celebration**: Visual animation (confetti or checkmark burst) when a project reaches 100% task completion.

## 3. Flashcards / Review

- [x] **N — Card flip animation**: 3D CSS transform flip when revealing the answer (front rotates away, back rotates in). Replace the current show/hide toggle with a spatial flip effect.
- [x] **O — Review streak counter**: Display a "7-day streak" badge with fire icon in the stats bar, tracking consecutive days with at least one review session.
- [x] **P — Difficulty heatmap**: Color-coded ease factor indicators on schedule list items (red = hard/low EF, yellow = medium, green = easy/high EF).
- [x] **Q — Review session summary**: After completing all due cards, show a summary screen with: cards reviewed, average rating, time spent, next review dates.
- [x] **R — Configurable daily review limit**: Setting to cap the number of cards shown per review session (e.g., max 20 cards). Stored in localStorage.
- [x] **S — Mastery badges**: Visual tier indicators (bronze/silver/gold dot or icon) on cards that have been reviewed many times with consistently high ease factor.

## 4. Pomodoro Timer

- [x] **V — Daily session goal**: Configurable daily pomodoro target (e.g., "4 pomodoros/day") with a circular progress ring in focus mode and mini widget showing progress toward the goal.
- [x] **W — Focus mode wallpapers**: Let users set a custom background image URL for focus mode (in addition to existing color themes). Stored in localStorage.
- [x] **X — Session history graph**: Small sparkline or bar chart showing pomodoros completed over the last 7 days, displayed in the focus mode settings or Today's Progress area.
