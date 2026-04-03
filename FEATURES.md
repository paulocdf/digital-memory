# Digital Memory — Feature Reference

Complete inventory of all features implemented in Digital Memory. For development guidance, see `AGENTS.md`. For code patterns, see `CONVENTIONS.md`.

Last updated: 2026-02-28

---

## 1. Task Management (Inbox)

**Files**: `todo-list.html` (~7,490 lines), `todo-edit-modal.html` (~2,480 lines)

### Core
- Create, edit, delete, and reorder tasks
- Subtasks with parent-child hierarchy (`parentId` field, one level deep)
- Auto-complete parent when all children are done (`actualMin` = sum of children)
- Drag-and-drop reordering via SortableJS (within and across day groups)
- Status lifecycle: active -> done -> deleted (soft delete)
- Scheduled dates, freeform categories, estimated/actual duration tracking
- Fractional `order` field for position tracking

### Bullet Journal (BuJo) Rapid-Logging
- Three entry types: `*` Task, `o` Event, `-` Note
- States: open, done, migrated, scheduled
- Click bullet cycles open <-> done; right-click opens state picker
- Tasks use completion modal; events/notes complete directly (no time tracking)
- Color coding per type and state

### AI-First Task Creation
- Quick Capture defaults to AI mode
- Natural language parsing extracts: title, due date, time-of-day, duration, category
- Multi-action detection splits compound sentences into separate tasks
- AI proactive suggestions: subtasks, scheduling, follow-ups

### Edit Modal
- Edit title, category, scheduled date, estimated minutes, pomodoro config, BuJo type/state, kanban status
- Task sharing UI (share by email, collaborator list)
- Notes field for freeform text

### Instant Delete with Undo
- Delete immediately soft-deletes (no confirmation dialog)
- Toast with "Undo" button (5-second window)
- Snapshot captures pre-delete state for full restoration (task + subtasks)

### UX Details
- Category prompt on Enter (when adding task without category, popover opens first)
- Cmd+Enter rapid subtask entry (saves and reopens input)
- Drag handles hidden until hover (6-dot grip icon)
- Task reorder across day groups updates `scheduledDate`
- Estimated finish time per day group (sequential, accounts for active timer)
- Custom minutes override input next to pomodoro button
- Configurable default pomodoro count (from settings)
- Auto-schedule today toggle (from settings)

---

## 2. Pomodoro Timer

**File**: `pomodoro-timer.html` (~5,570 lines)

### Core Timer
- Floating draggable widget (fixed, bottom-right, 220px wide)
- Configurable work/break durations (per-task and global defaults)
- Multi-session support (configurable pomodoro count per task)
- Three-button control layout: Reset (discard) | Play/Pause | Next (complete & advance)
- Reset discards all accumulated work time and restarts the timer fresh (stays open, paused)
- Next completes the current task (instant completion with undo toast), finds the next undone task in the same day group, and auto-starts the timer on it. If no next task, just completes and closes.
- Close (X) saves progress and closes timer (no confirmation)
- Session counter, progress bar with phase-colored fill
- Page title shows countdown (`25:00 - Work | Digital Memory`)
- Time tracking: accumulated work seconds saved to task's `actualMin`
- Per-task progress persistence: saves accumulated work time and timer position to `dm-pomodoro-progress` localStorage key (keyed by todoId), survives browser close and task switching
- Timer position restoration: when resuming a paused task, countdown resumes from exact position via `remainingSeconds`
- "Started" indicator on todo items with saved progress (green badge: `started · Xmin`)

### Focus / Zen Mode
- Full-screen overlay (85vw x 82vh, max 960px x 720px)
- Two-column layout: large countdown + controls (left), task details + stats (right)
- Header strip with ambient visualizer canvas
- Session timeline: visual blocks for each pomodoro (completed/current/remaining)
- Subtask progress display within timer
- Responsive: tablets stack to single column; mobile full-screen

### Ambient Visualizer
- Canvas-based, renders in focus mode header strip
- **Aurora mode** (default): 12 soft glowing orbs with radial gradients, slow drift, trail fade
- **Wave mode**: 3 layered oscilloscope lines with muted neon colors
- Toggle button switches between modes
- HiDPI-aware, auto-resizes

### Cross-Device Timer Sync
- Firestore document `timerState/{userId}` (single doc per user)
- Write: every 5s during tick (debounced 10s to Firestore) + immediate on state changes
- Read: localStorage first (same device), then Firestore `tryRemoteRestore()`, then `onSnapshot` listener
- Conflict resolution: per-tab `deviceId`, timestamp guards, 4-hour staleness cutoff

### Push Notifications (PWA)
- Service worker schedules notifications for phase end
- Notifications mirror to Apple Watch when iPhone is locked
- Fallback to in-page `Notification` API
- Re-schedules on `visibilitychange` when app is backgrounded

### Sound Settings
- **Notification sounds** (work/break end): chime, bell, digital, bowl, ascending, pulse, none
- **Tick sounds** (during work): tick-soft, tick-click, tick-woodblock, none (default)
- **Volume slider**: 0-100%
- Preview buttons next to each dropdown
- All sounds synthesized via Web Audio API (no audio files)
- Global API: `window.dmSounds = { play(soundId, volume), presets, getVolume() }`

---

## 3. Kanban Board

**File**: `kanban-board.html` (~3,080 lines)

- 3-column board: To Do, In Progress, Done
- Drag-and-drop between columns via SortableJS with visual feedback (clone follows cursor, column highlights on dragover)
- Status sync: moving to Done marks task complete; moving out reopens
- Done column time filter: Today, 7 days, All
- Quick-add task button per column
- Edit modal integration (click card to edit)
- Keyboard-accessible card focus
- Grab cursor on cards, ghost placeholder on drag

---

## 4. Dashboard / Analytics

**File**: `dashboard.html` (~1,070 lines)

### Charts
- **Donut chart**: Category breakdown of tracked time (D3.js)
- **Bar chart**: Daily/weekly/monthly tracked time by category
- **Stat cards**: Total tracked, daily average, top category, task count

### Time Filters
- Today, Week, Month, Year, Custom date range, All

### Period-over-Period Comparison
- Automatically computes previous period of equal duration
- Stat cards show delta arrows with percentage change
- Donut chart: thin outer ring for previous period proportions
- Bar chart: dashed ghost bars for previous period
- Tooltips show "vs prev period" delta

---

## 5. Knowledge Graph

**File**: `graph.js` (~1,930 lines)

- D3.js force-directed graph on landing page
- Nodes = notes, edges = wikilinks + title mentions
- Built from IndexedDB data
- Interactive: click to navigate, hover to highlight, scroll to zoom
- Dark/light mode aware

---

## 6. Notes & Knowledge Base

**Files**: `note-viewer.html` (~1,100 lines), `single-note.html` (~990 lines), `section-notes.html` (~530 lines)

### Organization
- Four content sections: Books (flat), Topics (flat), Snippets (grouped by language), Inbox (single-note)
- Tag system with dynamic tag cloud (`tag-cloud.html`, ~340 lines)
- Note pinning (thumbtack icon, pinned notes sort first in sidebar)
- Wikilinks `[[Note Title]]` with auto-resolution
- Backlinks section ("Linked from") with explicit/mention badges

### Note Viewer
- Full note content rendering via marked.js
- Pin, review (SR), edit, history, delete action buttons
- Attachment display section
- Backlinks section

### Note Editor
**File**: `note-edit-modal.html` (~1,270 lines)
- Markdown editor with toolbar (bold, italic, code, heading, todo checkbox)
- Live preview panel (side-by-side on wide screens)
- Tag management (type + Enter to add, Backspace to remove last)
- Drag-drop file upload, paste upload, progress bar
- Auto-insert markdown for uploaded images
- Attachment gallery within editor

### Version History
**File**: `version-history-modal.html` (~570 lines)
- LCS diff viewer showing changes between versions
- Full content view mode
- Restore and delete functionality
- Max 50 versions per note, auto-pruned on save
- Snapshot saved BEFORE each edit (captures previous state)

### Import
**File**: `import-notes.html`
- Bulk import utility for notes from external sources

---

## 7. Spaced Repetition / Review Queue

**File**: `review-queue.html` (~1,760 lines)

- SM-2 algorithm (SuperMemo 2) with quality ratings 0-5
- Flashcard UI: show title first, reveal content on click, then rate
- Keyboard shortcuts: Space=reveal, 0-5=rate, Enter=next
- Stats bar with due/total counts, progress bar
- Schedule list showing all enrolled notes with due dates and EF values
- Explicit opt-in per note via book icon button
- Dedicated page at `/docs/review/`

---

## 8. AI Companion

**Files**: `ai-companion.html` (~2,900 lines), `ai-chat.html` (~1,740 lines)

### Engine
- In-browser LLM: Qwen2.5-0.5B-Instruct via WebLLM/WebGPU
- ~350 MB first download (cached in browser), requires WebGPU support
- No API keys, no server calls — entirely client-side
- Enable/disable toggle in settings (persisted in localStorage)

### Dual Interface
- **Quick Capture AI mode**: Embedded chat in Quick Capture modal (`A` key opens)
- **Full page chat**: Dedicated page at `/docs/ai/`
- Both share engine instance via `window.dmAI`

### Task Awareness
- System prompt includes TODO data: Today, Overdue, Backlog, Upcoming, Recently Completed
- User-editable custom context injected into system prompt
- Quick actions: "Plan my day", "Suggest tasks", "Improve text", "Summarize"

### Conversational Task Creation
- 7 regex patterns detect task creation intent from natural language
- Parses date, time estimate, category from message text
- Creates task immediately without AI model involvement
- Rich confirmation message with task details

### Task Suggestions
- Detects `**bold**` items in AI responses
- Renders "Add as task" cards via `dm-ai-create-task` event
- Works in both Quick Capture and full-page chat

### Voice Input
- Microphone button using Web Speech API
- Available in Quick Capture AI mode and full-page chat

---

## 9. Task Sharing

**Files**: `dm-sync.html`, `todo-list.html`, `todo-edit-modal.html`, `body.html`, `firestore.rules`

### Architecture
- Hybrid client-side + security rules approach (no Cloud Functions)
- Deterministic share IDs: `{todoId}_{inviteeUid}`
- Invitee self-sufficient: can accept and modify shared tasks even when owner is offline

### Flow
1. Owner shares by email -> creates `taskShares` doc with `status: 'pending'`
2. Invitee sees invitation via real-time `onSnapshot` listener -> banner with Accept/Decline
3. Invitee accepts -> updates share status + adds self to todo's `collaborators` array
4. Owner notified via `onSnapshot` listener

### Permissions
- Owner: full CRUD on todo and shares
- Collaborator: read + update todo fields (except `userId`, `collaborators`)
- Invitee pre-accept: can only update share status

---

## 10. Data Sync Engine

**File**: `dm-sync.html` (~3,980 lines)

- IndexedDB as primary store (version 14, 10 object stores)
- Firestore as cloud sync layer
- Offline-first with write queue (`firestoreWrite()`)
- Client-side ID generation for offline-compatible creates
- Background sync every 5 minutes
- ~40+ public methods via `window.dmSync`
- Custom events for UI re-renders
- `serializeTodo()` / `serializeNote()` field whitelists control sync

---

## 11. Authentication

**Files**: `head.html`, all shortcodes

- Firebase Auth with Google sign-in
- `window.dmSignIn()`: popup-first, redirect fallback if popup blocked
- Safari ITP workaround: `signInWithPopup` avoids cross-origin storage issues
- `window.dmAuthReady` promise gates all auth-dependent code
- User isolation: IDB cleared on sign-out/user switch

---

## 12. Quick Capture

**Files**: `quick-capture-modal.html` (HTML/CSS), `body.html` (JS logic, ~4,380 lines)

- 4 modes: AI (default), Note, Code, Todo
- Tab/Shift+Tab cycles modes
- Ctrl/Cmd+Enter saves
- AI mode embeds chat inline with streaming
- Todo mode has full fields (title, estimate, date, reminder)
- Inbox append/new toggle for Note mode

---

## 13. Search

**File**: `search.js` (~380 lines)

- Full-text search via FlexSearch v0.6.30
- Indexes from IndexedDB (not Hugo's static data)
- Index cached in IDB `meta` store for persistence
- Validated by `noteCount` comparison on load
- Invalidated and rebuilt on `dm-sync-complete`
- Keyboard: Ctrl/Cmd+K or S or / to open, Escape to close, arrows to navigate

---

## 14. Export

**File**: `export-modal.html` (~1,240 lines)

- Bulk and single-item export
- Scopes: Entire vault, notes, tasks, flashcards, books
- ZIP export via JSZip

---

## 15. Trash

**File**: `trash-list.html` (~700 lines)

- Soft delete via `deletedAt` timestamp field
- Restore, permanent delete, empty trash
- Client-side auto-purge of items trashed 30+ days
- Dedicated page at `/docs/trash/`

---

## 16. History (Calendar View)

**File**: `note-history.html` (~910 lines)

- Calendar grid view of past task activity
- Closed days tracking
- Dedicated page at `/docs/history/`

---

## 17. Settings

**File**: `body.html` (sidebar panel)

- Sidebar settings panel (gear icon between AI and Trash)
- Pomodoro defaults: work duration, default session count
- Auto-schedule today toggle
- Sound settings: notification sounds, tick sounds, volume slider, preview buttons
- AI custom context textarea
- AI enable/disable toggle
- All settings save instantly to localStorage, dispatch `dm-settings-changed` event

---

## 18. PWA / Installability

**Files**: `manifest.json`, `sw.js`, `sw-register.js`

- Web app manifest with standalone display mode
- Service worker with network-first caching
- Apple PWA meta tags (apple-mobile-web-app-capable, status bar, title, touch icon)
- Installable on iOS and Android
- Push notification support via service worker message passing

---

## 19. Keyboard Shortcuts

**File**: `keyboard-shortcuts.html`

- `?` key opens overlay (global, not in input fields)
- Organized by context: Global, Search, Quick Capture, Edit, Review, Lightbox

| Context | Key | Action |
|---------|-----|--------|
| Global | `Q` | Open Quick Capture |
| Global | `A` | Open Quick Capture in AI mode |
| Global | `T` | Focus task input |
| Global | `E` | Edit current note |
| Global | `[` | Toggle sidebar |
| Global | `Ctrl/Cmd+K` | Open search |
| Global | `S` or `/` | Open search |
| Search | `Escape` | Close search |
| Search | `Arrow keys` | Navigate results |
| Search | `Enter` | Open selected |
| Quick Capture | `Escape` | Close modal |
| Quick Capture | `Ctrl/Cmd+Enter` | Save |
| Quick Capture | `Tab` / `Shift+Tab` | Cycle modes |
| Edit | `Escape` | Close modal |
| Edit | `Ctrl/Cmd+Enter` | Save |
| Edit | `Ctrl/Cmd+B/I/E` | Bold/Italic/Code |
| Review | `Space` | Reveal content |
| Review | `0-5` | Rate recall quality |
| Lightbox | `Escape` | Close |
| Lightbox | `+/-` | Zoom in/out |
| Lightbox | `0` | Fit to view |

---

## 20. Diagrams

**Files**: `html-head.html`, `_custom.scss`

- Mermaid v9.2.0 (bundled locally) for flowcharts, sequence diagrams, etc.
- Kroki API for PlantUML, D2, GraphViz, and other diagram types
- Diagram lightbox with fullscreen pan/zoom
- Dark mode aware (reads `data-theme` attribute)

---

## Global APIs

| API | Purpose |
|-----|---------|
| `window.dmSync` | Data layer: CRUD for notes, todos, review cards, attachments, task shares (~40+ methods) |
| `window.dmPomodoro` | Timer: `start()`, `stop()`, `finish()`, `pause()`, `resume()`, `togglePause()`, `isActive()`, `isTimerRunning()`, `getActiveTodoId()`, `getSessionInfo()`, `getTaskProgress(todoId)`, `clearTaskProgress(todoId)`, `getStartedAt()` |
| `window.dmSounds` | Sound: `play(soundId, volume)`, `presets`, `getVolume()` |
| `window.dmAI` | AI: `isEnabled()`, `setEnabled()`, engine management, NLP parsing, task creation |
| `window.dmTodoEdit` | Task edit modal: `open(todo, callback)` |
| `window.dmEditModal` | Note edit modal: `open(note, callback)` |
| `window.dmKeyboardShortcuts` | Shortcuts overlay: `open()`, `close()` |
| `window.dmAuth` | Firebase Auth instance |
| `window.dmDb` | Firestore instance |
| `window.dmAuthReady` | Promise resolving when auth state is known |
| `window.dmSignIn()` | Sign-in helper (popup-first, redirect fallback) |
| `window.dmIsMobile` | Boolean for mobile device detection |
| `window.dmIsLocalhost` | Boolean for local development detection |
| `window.dmEnableCheckboxes()` | Enable interactive checkboxes in rendered markdown |
| `window._wikilinkMap` | Map of note titles to IDs for wikilink resolution |
