# Digital Memory — Feature Reference

This document catalogues all features currently implemented in Digital Memory.
It is intended for developers and product stakeholders to understand what exists
in the codebase today.

Last updated: 2026-02-21

---

## Tech Stack

- **Static site generator**: Hugo
- **Theme**: hugo-book (customized, in `themes/hugo-book/`)
- **Frontend**: Vanilla JS (no framework, no bundler) — all JS is inline in Hugo partials/shortcodes
- **Styling**: SCSS compiled by Hugo (`_custom.scss`, `_graph.scss`)
- **Backend**: Firebase (Firestore for cloud sync, Firebase Auth for authentication)
- **Local storage**: IndexedDB (local-first sync via `dm-sync.html`)
- **AI**: In-browser LLM via WebLLM (Qwen2.5-0.5B-Instruct) — no server calls
- **Charts**: D3.js v7.0.1
- **Drag & drop**: SortableJS
- **PWA**: Service worker + web app manifest (installable on iOS/Android)

---

## 1. Task Management (Inbox)

**Files**: `todo-list.html`, `todo-edit-modal.html`, `quick-capture-modal.html`

### Core
- Create, edit, delete, and reorder tasks
- Subtasks with parent-child hierarchy (`parentId` field)
- Drag-and-drop reordering via SortableJS
- Status lifecycle: active → done → archived → deleted
- Scheduled dates for tasks
- Categories for organization
- Estimated duration per task (`estimatedMin`)
- Actual tracked time (`actualMin`)

### AI-First Task Creation
- Quick Capture defaults to AI mode
- Natural language parsing extracts: title, due date, time-of-day, priority, duration, category
- Multi-action detection splits compound sentences into separate tasks (e.g., "buy milk and call dentist" → 2 tasks)
- AI proactive suggestions: subtasks, scheduling, follow-ups
- Tasks moved to "Today" filter automatically get today's date

### Bullet Journal (BuJo) Rapid-Logging
- Three entry types: `•` Task, `○` Event, `–` Note
- `bujoType` field: task / event / note
- `bujoState` field: open / done / migrated / scheduled
- Click bullet cycles open ↔ done; right-click opens state picker
- Tasks use completion modal; events/notes complete directly (no modal, no time tracking)
- Hover morph: open → checkmark on hover, done → original icon on hover
- Color coding per type and state:
  - Task: open `#3d3d3d`, done `#7a7a7a`, migrated `#8b6e4e`, scheduled `#5b7a8a`
  - Event: open `#4a7a9b`, done `#7a9aab`
  - Note: open `#888888`, done `#7a7a7a`

### Edit Modal
- Double-click a task to open edit modal
- Edit title, category, scheduled date, estimated minutes, pomodoro config
- Escape key closes modal

### Instant Delete with Undo
- Delete button immediately soft-deletes (no confirmation dialog)
- Toast notification with "Undo" button (5-second window)
- Snapshots pre-delete state for full restoration (task + subtasks)
- `position: fixed` toast on `document.body` with `z-index: 9999`
- Bulk "Archive All" retains confirmation modal

---

## 2. Pomodoro Timer

**File**: `pomodoro-timer.html` (~2941 lines)

### Core Timer
- Floating widget (`position: fixed`, bottom-right corner, 220px wide)
- Configurable work/break durations (per-task and global defaults)
- Multi-session support (configurable pomodoro count per task)
- Play/pause, reset, skip phase, stop controls
- Session counter ("Session 2 of 4")
- Progress bar with phase-colored fill (blue for work, green for break)
- Page title shows countdown (`25:00 — Work | Digital Memory`)
- Time tracking: accumulated work seconds saved to task's `actualMin`

### Focus / Zen Mode
- Full-screen overlay (85vw × 82vh, max 960px × 720px)
- Two-column layout:
  - **Left**: Large 5.5rem countdown, progress bar, controls (60px primary, 42px secondary), session label, session timeline, subtasks list, info section (started/left/finish)
  - **Right** (260px): Task Details panel, Today's Stats panel (2×2 grid)
- **Header strip**: Ambient visualizer canvas behind phase label and action buttons
- Session timeline: visual blocks for each pomodoro (completed/current/remaining)
- Responsive: tablets (<800px) stack to single column; mobile (<600px) full-screen

### Ambient Visualizer
- Canvas-based, renders in the focus mode header strip
- **Aurora mode** (default): 12 soft glowing orbs with radial gradients, slow drift, gentle pulsing, trail fade via partial-alpha overlay
- **Wave mode**: 3 layered oscilloscope lines with muted neon colors, evolving parameters, soft glow
- Toggle button switches between modes
- Dark background (`#0a0a14`), HiDPI-aware, auto-resizes
- Starts/stops with focus mode lifecycle

### Subtask Display in Timer
- Progress header with mini bar ("Subtasks 2/5")
- Checkbox-style indicators, right-aligned estimate pills
- Active-first sorting, compact layout
- When timing a subtask, shows all sibling subtasks with active one highlighted

### Two-Way Sync (Same Device)
- Custom events: `dm-pomodoro-stopped`, `dm-pomodoro-state-changed`, `dm-todos-updated`
- State persistence in localStorage (`dm-pomodoro-state`) survives page navigation
- Tracked minutes persisted separately (`dm-pomodoro-tracked`)
- Finish-at calculation includes uncompleted subtask estimated times

### Cross-Device Timer Sync
- Firestore document `timerState/{userId}` — single document per user
- Synced fields: `activeTodoId`, `activeTodoTitle`, `activeTodoCategory`, `activeParentId`, `phase`, `secondsLeft`, `totalPhaseSeconds`, `sessionCount`, `totalSessions`, `accumulatedWorkSeconds`, `startedAt`, `WORK_SECONDS`, `BREAK_SECONDS`, `isRunning`, `savedAt`, `deviceId`
- **Write strategy**:
  - `saveState()` (every 5s during tick) → localStorage + debounced Firestore write (10s debounce)
  - `saveStateImmediate()` (on start/pause/resume/skip/reset/phase transitions) → localStorage + immediate Firestore write
  - `clearState()` → removes localStorage + deletes Firestore document
- **Read strategy**:
  - On page load: restore from localStorage first (fast, same device)
  - After `dmAuthReady`: `tryRemoteRestore()` — if no local timer, fetch from Firestore and apply
  - `onSnapshot` listener for real-time cross-device updates
- **Conflict resolution**:
  - Per-tab `deviceId` prevents self-triggering from own writes
  - `_lastFsSavedAt` timestamp skips stale snapshots
  - `_fsSyncing` guard flag prevents write-back loops during remote state application
  - States older than 4 hours are discarded
- **Security**: Firestore rules enforce `request.auth.uid == userId`

### Push Notifications (PWA)
- Notification permission requested on first timer start
- Service worker schedules notifications for phase end (work complete / break over)
- Notifications mirror to Apple Watch when iPhone is locked
- Fallback: in-page `Notification` API when service worker unavailable
- Re-schedules on `visibilitychange` when app is backgrounded
- Tap notification focuses the app window

### Configurable Sound Settings
- **Location**: Sidebar settings panel
- **Notification sounds** (work end / break end): chime, bell, digital, bowl, ascending, pulse, none
- **Tick sounds** (during work): tick-soft, tick-click, tick-woodblock, none (default)
- **Volume slider**: 0-100%
- **Preview buttons** next to each dropdown
- All sounds synthesized via Web Audio API (no audio files)
- localStorage keys: `dm-pomo-sound-work`, `dm-pomo-sound-break`, `dm-pomo-sound-tick`, `dm-pomo-sound-volume`
- Global API: `window.dmSounds = { play(soundId, volume), presets, getVolume() }`

---

## 3. Analytics (Time View)

**Files**: `graph.js`, `_graph.scss`

### Charts
- **Donut chart**: Category breakdown of tracked time
- **Bar chart**: Daily/weekly/monthly tracked time by category
- **Stat cards**: Total tracked, daily average, top category, task count

### Time Filters
- Today, Week, Month, Year, Custom date range, All

### Period-over-Period Comparison
- For Week/Month/Year/Custom: automatically computes previous period of equal duration
- Stat cards show delta arrows (▲/▼) with percentage change and previous absolute value
- Donut chart: thin outer ring showing previous period category proportions
- Bar chart: dashed ghost bars behind current bars for previous period
- Tooltips show "vs prev period" delta
- "All" mode has no comparison; edge cases handled gracefully

---

## 4. Notes & Knowledge Base

**Files**: `note-viewer.html`, `single-note.html`, `section-notes.html`

- Markdown notes organized in Hugo content sections
- Full-text search
- Tag system with tag cloud (`tag-cloud.html`)
- Knowledge graph visualization (`graph.js` with D3 force layout)
- Import from external sources (`import-notes.html`)

---

## 5. Spaced Repetition / Review Queue

**File**: `review-queue.html`

- Flashcard-based review system
- Spaced repetition scheduling
- Review queue with due items

---

## 6. AI Companion

**File**: `ai-companion.html`

- In-browser LLM (Qwen2.5-0.5B-Instruct via WebLLM)
- No server-side API calls — runs entirely in the browser
- System prompt, markdown rendering, streaming responses
- Mode badges, error handling with retry
- NLP parsing for task creation (`window.dmAI`)

---

## 7. Authentication

**Files**: `head.html`, all shortcodes

- Firebase Authentication with Google sign-in
- `window.dmSignIn()` global helper: popup-first for mobile + desktop, redirect fallback if popup blocked, redirect-only on localhost
- Safari ITP workaround: `signInWithPopup` avoids cross-origin storage issues that cause `signInWithRedirect` to silently fail on iOS
- `window.dmAuthReady` promise gates all auth-dependent code
- Mobile detection: `window.dmIsMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)`
- All 11 sign-in handlers across all files call `window.dmSignIn()`
- All auth subscribers use Pattern A (`dmAuthReady.then()` deferral)

---

## 8. Data Sync

**File**: `dm-sync.html`

- **Local-first**: IndexedDB as primary store, Firestore as cloud sync
- `serializeTodo()` field whitelist controls what syncs to Firestore
- Todo fields: id, userId, title, estimatedMin, actualMin, category, pomodoroCount, pomodoroLength, breakLength, done, status, parentId, order, scheduledDate, reminderAt, reminderFired, source, bujoType, bujoState, createdAt, updatedAt, completedAt
- `updateTodoField(todoId, firestoreUpdates, localUpdates)` — schema-free updates
- `createTodo(title, estimatedMin, parentId, scheduledDate, reminderAtMs, category, atTop, pomodoroCount, pomodoroLength, onDone, source, breakLength, bujoType)`
- Public API: `window.dmSync`

---

## 9. PWA / Installability

**Files**: `config.toml`, `manifest.json`, `sw.js`, `sw-register.js`, `html-head.html`

- Web app manifest with standalone display mode
- Service worker with network-first caching strategy
- Apple PWA meta tags (`apple-mobile-web-app-capable`, status bar style, title)
- Apple touch icon
- Installable on iOS (Add to Home Screen) and Android
- Push notification support via service worker message passing
- HTTPS via GitHub Pages (`paulocdf.github.io/digital-memory`)

---

## 10. Settings

**File**: `body.html` (sidebar)

- Settings panel in sidebar footer
- Pomodoro defaults: short work, short break, long work, long break, default session count
- Auto-schedule today toggle
- Sound settings (work end, break end, tick sound, volume)
- localStorage-based persistence

---

## Global APIs

| API | Purpose |
|---|---|
| `window.dmSync` | Data layer (CRUD, IndexedDB + Firestore) |
| `window.dmPomodoro` | Timer control (start, stop, pause, resume, togglePause, isActive, getSessionInfo) |
| `window.dmSounds` | Sound system (play, presets, getVolume) |
| `window.dmAI` | NLP parsing for task creation |
| `window.dmTodoEdit` | Edit modal control |
| `window.dmAuth` | Firebase Auth instance |
| `window.dmDb` | Firestore instance |
| `window.dmAuthReady` | Promise that resolves when auth is initialized |
| `window.dmIsMobile` | Boolean for mobile device detection |
| `window.dmIsLocalhost` | Boolean for local development detection |

---

## Architecture Notes

- **No build system**: All JS is inline in Hugo HTML partials. No npm, no bundler, no transpilation.
- **SCSS**: Compiled by Hugo's asset pipeline (`_custom.scss`, `_graph.scss`).
- **Submodule**: Theme lives in `themes/hugo-book/` as a git submodule pointing to `paulocdf/hugo-book`.
- **Hosting**: GitHub Pages at `https://paulocdf.github.io/digital-memory/`.
- **Critical sync chokepoint**: `serializeTodo()` in `dm-sync.html` is a field whitelist. Any new field must be added there or it will be silently dropped during Firestore-to-IDB sync.
- **Function hoisting**: All JS functions are inside IIFEs, so `function` declarations are hoisted and can reference each other freely.
