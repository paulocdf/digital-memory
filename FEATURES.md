# Digital Memory — Feature Reference

Complete inventory of all features implemented in Digital Memory. For development guidance, see `AGENTS.md`. For code patterns, see `CONVENTIONS.md`.

Last updated: 2026-04-10

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

### Financial Context (opt-in, cloud providers only)
- Settings toggle `Include budget context` (localStorage `dm-ai-include-budget`, default off)
- When enabled and signed in with OpenAI or Gemini, appends a `## Financial Context` section to the system prompt: monthly income/allocated/spent/to-be-budgeted, up to 5 over-budget categories, and the last 7 days of transactions (max 8)
- Never sent to the local WebLLM provider (not needed; data never leaves device anyway)
- Helper `window.dmAI._loadBudgetContext()` returns `null` when the setting is off, there is no auth, or `dmBudget` is unavailable

### AI expense parsing (Quick Capture Expense mode)
- When the regex parser returns `no-amount`, Quick Capture shows a "Try AI parse" button (cloud providers only)
- `window.dmAI.parseExpense(rawText)` → one-shot JSON extraction with `temperature: 0`, returns `{amount, date, payee, income, categoryHint}` or `null`
- Result is fed into the same `createTransaction()` path as the regex parser — user never leaves the modal

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

## 10. Project Sharing

**Files**: `dm-sync.html`, `project-list.html`, `body.html`, `firestore.rules`

### Architecture
- Same hybrid client-side + security rules approach as task sharing (no Cloud Functions)
- Deterministic share IDs: `{projectId}_{inviteeUid}`
- `projectShares` IDB store with indexes on `projectId`, `ownerId`, `inviteeEmail`, `status`
- Invitee self-sufficient: can accept and modify shared projects even when owner is offline

### Flow
1. Owner shares by email -> creates `projectShares` doc with `status: 'pending'`
2. Invitee sees invitation via real-time `onSnapshot` listener -> banner with Accept/Decline/Dismiss
3. Invitee accepts -> updates share status (direct Firestore write) + adds self to project's `collaborators` array + batch-adds self to all existing project tasks' `collaborators` arrays
4. Owner notified via `onSnapshot` listener on their project shares
5. New tasks created in shared projects automatically include all project collaborators

### Task Propagation
- **On accept**: collaborator batch-added to all existing project tasks
- **On new task**: all project collaborators auto-included in `collaborators` array (in `todo-list.html`, `project-list.html`, `kanban-board.html`)
- **On unshare**: collaborator batch-removed from all project tasks

### UI
- **Project edit modal**: sharing section with email input, share button, collaborator list with status badges and remove buttons; owner info for non-owners; hidden in create mode
- **Invitation banner**: `#dm-project-invitations-banner` in `body.html` with Accept/Decline/Dismiss buttons

### Permissions
- Owner: full CRUD on project and shares
- Collaborator: read + update project fields (except `userId`, `collaborators`)
- Invitee pre-accept: can only update share status

### Key Implementation Details
- `acceptProjectShare()` uses direct Firestore writes (not `firestoreWrite()`) because the security rule checks that share status is already `'accepted'` in Firestore before allowing collaborator array update
- `syncProjects()` queries both `userId ==` and `collaborators array-contains` to fetch shared projects
- 3 real-time `onSnapshot` listeners: project share invites, owner project shares, shared projects

---

## 11. Data Sync Engine

**File**: `dm-sync.html` (~4,530 lines)

- IndexedDB as primary store (version 15, 11 object stores)
- Firestore as cloud sync layer
- Offline-first with write queue (`firestoreWrite()`)
- Client-side ID generation for offline-compatible creates
- Background sync every 5 minutes
- ~40+ public methods via `window.dmSync`
- Custom events for UI re-renders
- `serializeTodo()` / `serializeNote()` field whitelists control sync

---

## 12. Authentication

**Files**: `head.html`, all shortcodes

- Firebase Auth with Google sign-in
- `window.dmSignIn()`: popup-first, redirect fallback if popup blocked
- Safari ITP workaround: `signInWithPopup` avoids cross-origin storage issues
- `window.dmAuthReady` promise gates all auth-dependent code
- User isolation: IDB cleared on sign-out/user switch

---

## 13. Quick Capture

**Files**: `quick-capture-modal.html` (HTML/CSS), `body.html` (JS logic, ~4,520 lines)

- 5 modes: AI (default), Note, Code, Todo, Expense
- Tab/Shift+Tab cycles modes
- Ctrl/Cmd+Enter saves
- AI mode embeds chat inline with streaming
- Todo mode has full fields (title, estimate, date, reminder)
- Expense mode parses natural-language input and creates a budget transaction:
  - `$12.50 coffee` → `-1250¢`, payee "coffee", today
  - `4.50 lunch yesterday` → `-450¢`, yesterday
  - `+500 salary 04/15` → `+50000¢` income, April 15
  - `12 groceries #food` → category hint `food` (matched by name slug)
  - Supports `today` / `yesterday` / `yday` keywords, `YYYY-MM-DD`, `MM/DD` (rolls back if future), comma-decimal (`3,75`)
  - Live amount+payee+date preview under the input; category dropdown populated from `dmBudget.getCategories()`
  - Saves via `dmBudget.createTransaction({ source: 'quick-capture' })` against the default account (`ensureDefaultAccount()`)
  - Pure parser exposed as `window.dmQuickCaptureParseExpense(text)` for testability
- Inbox append/new toggle for Note mode

---

## 14. Search

**File**: `search.js` (~380 lines)

- Full-text search via FlexSearch v0.6.30
- Indexes from IndexedDB (not Hugo's static data)
- Index cached in IDB `meta` store for persistence
- Validated by `noteCount` comparison on load
- Invalidated and rebuilt on `dm-sync-complete`
- Keyboard: Ctrl/Cmd+K or S or / to open, Escape to close, arrows to navigate

---

## 15. Export

**File**: `export-modal.html` (~1,240 lines)

- Bulk and single-item export
- Scopes: Entire vault, notes, tasks, flashcards, books
- ZIP export via JSZip

---

## 16. Trash

**File**: `trash-list.html` (~700 lines)

- Soft delete via `deletedAt` timestamp field
- Restore, permanent delete, empty trash
- Client-side auto-purge of items trashed 30+ days
- Dedicated page at `/docs/trash/`

---

## 17. History (Calendar View)

**File**: `note-history.html` (~910 lines)

- Calendar grid view of past task activity
- Closed days tracking
- Dedicated page at `/docs/history/`

---

## 18. Settings

**File**: `body.html` (sidebar panel)

- Sidebar settings panel (gear icon between AI and Trash)
- Pomodoro defaults: work duration, default session count
- Auto-schedule today toggle
- Sound settings: notification sounds, tick sounds, volume slider, preview buttons
- AI custom context textarea
- AI enable/disable toggle
- All settings save instantly to localStorage, dispatch `dm-settings-changed` event

---

## 18a. Appearance / Radical Customization

**Files**: `appearance.html` (~500 lines), `_defaults.scss`, `docs/inject/head.html` (early-apply)

### Skin presets
One-click curated combinations of accent, surfaces, heading gradients, and radius. Ships with **6 skins**:
- **Default** — current look (blue accent)
- **Minimal** — monochrome, flat, sharp corners
- **Warm Paper** — cream background, brown accent, rounded
- **Terminal** — dark green-on-black mono feel
- **Neon** — saturated pink on dark with accent glow
- **Solarized** — classic Ethan Schoonover palette (light + dark)

Applied via `data-skin="..."` attribute on `<html>`; scoped CSS variable overrides live in `appearance.html`.

### Accent color picker
- 9 preset swatches plus a native `<input type="color">` for any custom hex
- Sets `--color-accent`, `--color-accent-hover` (via `color-mix`), `--color-accent-soft` on `<html>`
- Overrides the current skin's accent; "Use skin default" button to clear

### Background textures
6 options (None, Dots, Grid, Paper, Noise, Glow) applied via a `body::before` pseudo-layer when `data-bg-texture` is set on `<html>`. Light/dark-aware (paper & noise adapt their alpha).

### Sidebar width
Slider (12–22 rem) writes `--sidebar-width` on `<html>`. The Sass `$menu-width` usages in `_main.scss` and `_custom.scss` were converted to `var(--sidebar-width, #{$menu-width})` so the slider drives layout live.

### Architecture
- **No FOUC**: synchronous early-apply script in `docs/inject/head.html` reads localStorage and sets CSS vars / attributes before paint.
- **Live updates**: every control writes localStorage and dispatches `dm-settings-changed`.
- **Public API**: `window.dmAppearance` — `setSkin(id)`, `setAccent(hex|null)`, `setSidebarWidth(rem)`, `setBackground(id)`, `setHeaderHeight(rem)`, `setRadius(rem)`, `reset()`, `getState()`, `SKINS`, `ACCENTS`, `BACKGROUNDS`.
- **UI mount**: `window.dmAppearanceBuildPanel(containerEl)` — idempotent, builds controls on first settings-modal open.

### localStorage keys
```
dm-theme-skin           (preset id; removed when "default")
dm-theme-accent         (hex; removed when using skin default)
dm-theme-sidebar-width  (rem, 12-22)
dm-theme-header-height  (rem, reserved for future use)
dm-theme-radius         (rem, reserved for future use)
dm-theme-background     (none|dots|grid|paper|noise|gradient)
```

---

## 18c. Project & Task Visual Identity

**Files**: `dm-sync.html` (theme registry + `dmApplyProjectTheme`), `project-list.html` (project edit modal + detail banner), `todo-edit-modal.html` (task flair controls), `todo-list.html`, `kanban-board.html` (task flair rendering), `_custom.scss` (CSS), `static/icons/sprite.svg`

### Project appearance
- **10 curated themes**: default, ocean, sunset, forest, mono, neon, paper, terminal, lavender, citrus — each defines accent, accent2, banner style, pattern, font family, density, card shape
- **Per-project overrides**: icon (Lucide sprite), emoji, accent / accent2, banner style, pattern (dots/grid/paper/noise/diagonal), density, card shape, font family
- **Banner**: rendered at the top of the project detail view; shows the project's icon/emoji + name + description + meta over the themed background
- **Project cards** show the project icon/emoji where available; fall back to the color dot
- **Theme application**: `window.dmApplyProjectTheme(rootEl, project)` writes `data-project-theme="..."`, `data-project-density`, `data-project-pattern`, `data-project-shape`, and CSS variables (`--pj-accent`, `--pj-accent2`, `--pj-radius`, `--pj-density-pad`, `--pj-font`) on the root element. Pass `null` to clear.
- **Kanban board** picks up the project theme automatically when filtered to exactly one project; clears it when filter is cleared or multi-select.
- **Per-column accents**: each project can override individual kanban columns with an accent color and a single emoji prefix. Stored as `project.kanbanColumnStyles = { [columnId]: { accent, emoji } }`. Edited from the project edit modal ("Kanban column accents" section, edit-mode only). Applied by the kanban board only when filtered to exactly one project. When a kanban column is deleted, orphan entries are stripped from every project automatically.
- **Sidebar deep linking** (Phase 8): collapsible "Projects" section in the dynamic sidebar lists every active project (sorted by `order`) with its emoji/icon glyph + accent dot. Clicking jumps to `/docs/projects/#project-{id}`; the projects shortcode parses the hash on load (`parseProjectHash`) and `hashchange` to open the right detail view. The active item gets `.active` styling. The list re-renders (200ms-debounced) on `dm-projects-updated`.
- **Inbox project accent** (Phase 9): inbox task rows whose task has no own `color` but belongs to a project with a resolved accent get a 3px inset accent strip + 4% color-mix background tint. Accent priority: `project.accent → theme preset.accent → legacy project.color`. Sets `data-has-project-theme="1"` and `--task-project-accent` on the row.
- **A11y** (Phase 10): theme picker and icon grid expose `role="radiogroup"` with arrow-key/Home/End navigation; segmented controls (banner, pattern, density, shape, font) expose `role="group"` + `aria-pressed` per button; sidebar project glyphs and detail-banner emoji marked `aria-hidden`; label chip remove buttons get `aria-label="Remove label {name}"`; defensive `:focus-visible` outline + halo guarantees a visible focus ring across all skins.

### Task flair
- **Per-task fields**: `icon`, `emoji`, `labels` (string[]), `borderStyle` (`'rail' | 'full' | 'dashed' | 'glow'`), `priority` (`'low' | 'med' | 'high' | 'urgent'`)
- **Rendering**: priority dot, icon/emoji prefix, label chips appear in inbox rows, project task lists, and kanban cards. `data-border-style` and `data-priority` attributes are set on each task element so CSS can style accordingly.
- **Edit panel**: priority + border-style segmented controls, emoji input, free-form labels editor (chips with × removal) inside the inline task edit panel.

### Data
- IndexedDB v18 — additive fields only, no new stores.
- Project serializer adds: `themeId, icon, emoji, accent, accent2, bannerStyle, pattern, density, cardShape, fontFamily, kanbanColumnStyles`.
- Todo serializer adds: `icon, emoji, labels, borderStyle, priority`.

### Public API
| API | Purpose |
|-----|---------|
| `window.dmProjectThemes` | Theme registry: `{ id, name, accent, accent2, bannerStyle, pattern, font, density, shape }` |
| `window.dmGetProjectTheme(id)` | Look up a theme by id (falls back to `default`) |
| `window.dmResolveProjectTheme(project)` | Returns the effective theme — project overrides merged onto its `themeId` preset |
| `window.dmApplyProjectTheme(rootEl, project)` | Apply / clear a theme on a DOM element |

---

## 18b. Icon System (Lucide sprite)

**Files**: `static/icons/sprite.svg`, `layouts/partials/icon.html`, `html-head.html` (JS helper)

Modern consistent icon foundation, fully adopted across the app:
- Single SVG sprite with **110 Lucide icons** (including `icon-home`, `icon-archive`, `icon-target`, `icon-layout`, `icon-circle`, `icon-grip`, `icon-pencil`, etc.), `stroke-width: 2`, `currentColor`, `24×24` viewBox.
- **Hugo partial**: `{{ partial "icon" (dict "name" "play" "size" 16) }}` — short form `{{ partial "icon" "play" }}`.
- **JS helper**: `window.dmIcon("play", 20)` — returns an `<svg><use href="…#icon-play"/></svg>` string for dynamically-rendered UI.
- **Direct `<use>` pattern** (preferred for HTML/JS string concatenation): `<svg class="dm-icon dm-icon--NAME" width="W" height="H" viewBox="0 0 24 24" aria-hidden="true"><use href="/digital-memory/icons/sprite.svg#icon-NAME"/></svg>`
- Global `.dm-icon` / `.dm-icon--solid` base styles in `_custom.scss`.
- **~341 inline SVG icons migrated** to the sprite across 30 files (Apr 2026 sweep). Net −321 lines of code.
- **Legitimately excluded from migration** (keep as inline SVG): theme sun/moon toggle (class-toggled), Google brand logo (multi-color), progress rings (`todo-ring-*`, `focus-goal-ring-*`, `focus-history-svg`), BuJo bullets (stylized state indicators), kanban pattern previews, heading-letter glyphs. When adding new icons in these categories, keep them inline.

### Adding a new icon
1. Add a `<symbol id="icon-NAME" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</symbol>` entry before `</svg>` in `static/icons/sprite.svg`.
2. Reference it via `{{ partial "icon" "NAME" }}`, `window.dmIcon("NAME")`, or the direct `<use>` pattern.
3. Lucide source: https://lucide.dev/ — copy paths from the SVG export.

---

## 19. PWA / Installability

**Files**: `manifest.json`, `sw.js`, `sw-register.js`

- Web app manifest with standalone display mode
- Service worker with network-first caching
- Apple PWA meta tags (apple-mobile-web-app-capable, status bar, title, touch icon)
- Installable on iOS and Android
- Push notification support via service worker message passing

---

## 20. Keyboard Shortcuts

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

## 21. Diagrams

**Files**: `html-head.html`, `_custom.scss`

- Mermaid v9.2.0 (bundled locally) for flowcharts, sequence diagrams, etc.
- Kroki API for PlantUML, D2, GraphViz, and other diagram types
- Diagram lightbox with fullscreen pan/zoom
- Dark mode aware (reads `data-theme` attribute)

---

## 22. Budget & Finance

**Files**: `dm-sync.html` (data layer + `window.dmBudget` API), `budget-overview.html`, `budget-transactions.html`, `body.html` (settings section), `firestore.rules` (5 new collection blocks)

### Core
- **Accounts** — single default "Main" account auto-created via `ensureDefaultAccount()` (multi-account planned for a later phase)
- **Categories** — freeform expense or income categories, color coded
- **Envelope budgets** — monthly allocation per category; deterministic ID `{YYYY-MM}_{categoryId}` for idempotent upserts; optional **rollover flag** carries unspent leftovers into the following month. `getMonthSummary()` walks backward through consecutive rollover-enabled months (max 24) and accumulates forward, so multi-month chains compound automatically. Each category row exposes `rolledOverCents` + `effectiveAllocated` (allocated + rolled over); negative leftovers clamp at zero.
- **Transactions** — stored as integer cents (no floating point); fields: account, category, amount (sign encodes expense/income), date, month (indexed), payee, memo, cleared flag
- **Split transactions** — a single transaction can be divided across multiple categories via a `splits: [{categoryId, amount, memo}]` array. When splits are present, parent `categoryId` is nulled and monthly aggregation credits each split independently (no double-counting). Inline split panel in the transactions register lets users add/remove split rows; a live delta shows "balanced" vs "need $X"; Save only enabled when splits sum exactly to parent amount. `window.dmBudget.splitTransaction(id, splits)` API; passing `[]` restores single-category behavior.
- **Recurring rules** — daily/weekly/monthly/yearly cadence with interval (e.g. "every 2 weeks"). Auto-post scheduler runs once on sign-in and then every 60 min; backfills up to 90 days of missed occurrences; idempotent via `recurringId + date` guard; respects `endDate`; pausable via `autoPost: false`. Monthly/yearly date arithmetic clamps to last day of target month (Jan 31 → Feb 28/29). Managed from `/docs/budget/recurring/` with inline add/edit form, status badge (Active/Paused), and a "Post due now" button for manual triggering.
- **20 currencies supported** via ISO code dropdown in settings; formatted via `window.dmBudget.formatMoney(cents, currency)`. Choice persists to `userSettings/{uid}.budgetCurrency` on Firestore so it follows the user across devices; `localStorage['dm-budget-currency']` is the warm cache for synchronous reads. Skipped from cloud sync when budget local-only mode is enabled.

### Budget Overview page (`/docs/budget/`)
- Month switcher (◀ / ▶)
- Summary stats: budgeted, spent, remaining for the month
- Quick-add expense/income form
- Envelope list: per-category allocated vs spent with inline allocation editor and rollover toggle (small ↻ button per row; when active, leftover carries into next month and shows as a `+ $X` chip under the allocation)
- Add-category inline row
- Local-only notice banner when mode is enabled

### Transactions page (`/docs/budget/transactions/`)
- Register view with filters (month, category, text search)
- Inline edit all fields, delete per row

### CSV Import (`/docs/budget/import/`)
- 3-step wizard: paste/upload CSV → column mapping → preview & import
- **Pure CSV parser** (`window.dmBudgetParseCsv`) — RFC-4180-ish: handles quoted fields with commas, escaped `""`, embedded newlines, `\r\n`/`\n`/`\r` line endings, trailing-empty-row stripping
- **Money parser** (`window.dmBudgetParseMoney`) — `$1,234.56`, `(45.00)` parens-negative, `12.50-` trailing-minus, `3,75` comma-decimal, `1.234,56` European thousand+decimal, currency symbol stripping
- **Date parser** (`window.dmBudgetParseDate`) — `YYYY-MM-DD`, `YYYY/MM/DD`, `MM/DD/YYYY` (US default), `DD/MM/YYYY` (heuristic when first part > 12), 2-digit year (+2000), strips time component, validates month/day ranges
- **Auto-detect mapping** (`window.dmBudgetAutoDetectMapping`) — scans headers for date/amount/payee/memo/category synonyms (e.g. "Posted Date", "Description", "Memo", "Notes")
- **Duplicate detection** (`window.dmBudgetIsDuplicate`) — same amount + same payee (case-insensitive) + date within ±3 days flags as duplicate; ignores soft-deleted transactions; auto-skipped by default
- **Sign convention toggle** — "Negative = expense" checkbox (default ON); when OFF, flips sign so positive values become expenses (some banks export this way)
- **Per-row controls** — skip checkbox, category dropdown (auto-matched by case-insensitive name from CSV's category column), duplicate badge, error badge for invalid rows
- **Bulk actions** — "Skip all duplicates" / "Include all" buttons
- **Imports via** `dmBudget.createTransaction({ source: 'csv-import', ... })` — sequential promise chain; imported rows auto-marked skipped to prevent double-import on re-click

### Reports (`/docs/budget/reports/`) — Phase 3 Slice A
- Sticky range bar at top: This month (default), Last month, Last 3 months, Last 6 months, Year to date, Custom (date inputs)
- **Spending by Category** section: hand-rolled SVG donut + horizontal bar list, sorted by current-period spend desc; uncategorized rolled up under a synthetic "Uncategorized" row (gray)
- Prior-period comparison: each row shows delta arrow + percentage vs. the equal-length immediately-prior window; `null` deltaPct flagged as "new" when prior was zero
- Splits credited per-split (no double-counting); soft-deleted transactions excluded
- Hover linking: hovering a slice or list row dims non-matching items in both views
- Empty-state copy when no expenses fall in the selected range
- Listens for `dm-budget-updated` to repaint after data changes
- Future slices will append: trend line (B), calendar heatmap (C), net worth + cashflow forecast (D), insights cards (E), and a separate `/docs/budget/rules/` page for auto-categorization (F)
- Helpers added to `window.dmBudget`:
  - `resolveReportRange(input)` — normalizes preset ids or `{from, to}` into a `{ id, from, to, label }` range; uses calendar arithmetic for DST safety
  - `priorReportRange(range)` — equal-length window immediately preceding `range.from` (also calendar-arithmetic; returns `null` for zero-length input)
  - `getCategorySpend(rangeArg)` — returns `{ range, prior, rows[], currentTotal, priorTotal, deltaTotal }` where each row is `{ categoryId, name, color, kind, currentCents, priorCents, deltaCents, deltaPct, count }`
  - `getExpenseTrend({from, to, bucket})` — returns `{ range, bucket, points: [{ key, label, cents, movingAvgCents }], totalCents, peakCents, avgCents, maWindow }`. `bucket` is `'day' | 'week' | 'month' | 'auto'`; `'auto'` picks day for ≤45-day ranges, week for ≤180, else month. Trailing moving average emits `null` until the window is filled (7 day / 4 week / 3 month). Missing buckets are zero-filled to keep the line continuous; income excluded.
  - `getDailySpend({year})` — returns `{ year, days: [{ date, cents, dow, weekIndex }], totalCents, peakCents, avgCents, percentiles: { p50, p75, p90, p95 }, weekCount, firstDow }` for a GitHub-style calendar heatmap. Sunday-anchored grid; days zero-filled across the full year; percentiles computed across non-zero days only (with peak-quartile fallback when <4 non-zero days). Splits credited per-split, soft-deleted ignored, income excluded.
  - `getNetWorthSeries({from, to, bucket})` — returns `{ range, bucket, points: [{ date, label, cents }], earliestDate, currentCents, startCents, deltaCents }`. Walks accounts (respecting `includeInNetWorth !== false`) + all transactions, computes a running balance per bucket (carried-forward when a bucket has no activity). Auto-bucket picks day for ≤365-day ranges, else week. `from` defaults to the earliest tx date (`earliestDate`); `to` defaults to today. `startCents` = balance immediately before `from` (excludes from-day txs); `deltaCents = currentCents - startCents`. Memoized on `api._netWorthCache` keyed by `{from, to, bucket, maxUpdated, txCount, acctCount}` — self-invalidating on any data change. Soft-deleted txs excluded.
  - `getCashflowForecast({days, today})` — returns `{ days, range, points: [{ date, incomeCents, expenseCents, netCents, balanceCents, eventCount }], startBalanceCents, endBalanceCents, totalIncomeCents, totalExpenseCents, ruleCount, eventCount }`. Takes `getNetWorthSeries`'s `currentCents` as the start balance, walks active recurring rules (skips when `autoPost === false` or `endDate` has expired), advances each rule's `nextDueDate` forward to today via `computeNextDate`, then generates events through `today + days` (default 90). Positive amounts classified as income, negative as expense. Safety counter caps at 2000 iterations per rule.

### Spending Over Time (trend) — Phase 3 Slice B
- Hand-rolled SVG line + area chart with dashed moving-average overlay, on the same Reports page below "Spending by category"
- Bucket toggle (Day / Week / Month) — driven by `getExpenseTrend`'s `bucket` arg; the picker auto-highlights whichever bucket the helper resolved
- Stats row: total, average per bucket, peak, MA window label
- Hover overlay: vertical guide line + tooltip with bucket label, spend, and MA
- Empty-state copy when there are no expenses (`totalCents === 0`)
- Reuses the sticky range bar from Slice A — selecting a different range repaints the trend automatically

### Daily Spending Heatmap — Phase 3 Slice C
- GitHub-style year heatmap, Sunday-anchored: weeks as columns, days as rows
- Hand-rolled SVG (no D3): one `<rect class="day lvl-N">` per day with month and dow labels
- Independent year navigation (◀ / ▶) — separate from the global range bar (heatmaps are inherently a calendar-year view); next-year disabled when at current year
- 5-level color scale (lvl-0..lvl-4) bucketed by per-year percentiles (p50/p75/p90), via `color-mix(var(--color-accent), var(--gray-200))` — adapts to skin/accent
- Stats row: total, avg/day, peak day
- Hover tooltip: date + amount (or "No spending")
- Legend: Less ◻◻◻◻◻ More
- Empty-state copy when `totalCents === 0`

### Net Worth & Cashflow Forecast — Phase 3 Slice D
- **Net worth over time** — area + line SVG chart on the Reports page below the heatmap. Tracks balance across all accounts (respects `includeInNetWorth !== false`) since the user's earliest transaction. Caption shows "Tracking since {date} · bucket: day/week" (auto-bucket picks day for ≤365-day ranges, else week). Stats row: Current / Start / Change (green up / red down). Hover tooltip shows bucket date + balance. Self-invalidating memoization keyed on `{from, to, bucket, maxUpdated, txCount, acctCount}` keeps re-renders cheap.
- **90-day cashflow forecast** — line chart projecting balance forward over the next 90 days based on active recurring rules. Walks each rule's `nextDueDate` via `computeNextDate`, advances it forward to today, then generates events through today + 90 days. Positive amounts = income (green area fill), negative = expense (red area fill). Stats row: Start / End (proj) / Income / Expense / Events. Empty-state hint when no active recurring rules; rules with `autoPost === false` or expired `endDate` are skipped. Safety cap of 2000 iterations per rule.
- Both charts hand-rolled SVG (no D3); area + line use `var(--color-accent)`; cashflow zero-line is dashed when the projection crosses zero.

### Local-only mode
- Toggle in Settings → Budget
- Persists to `localStorage` as `dm-budget-local-only`
- `firestoreWrite()` short-circuits for budget collections (`accounts`, `categories`, `budgets`, `transactions`, `recurring`) — IDB writes only
- Two erase buttons in Settings:
  - **Erase local** — wipes the 5 IDB stores only; cloud copies untouched
  - **Erase everywhere** — wipes IDB and batch-deletes all Firestore docs for the current user

### Data layer
- **IndexedDB v17** — 5 new stores: `accounts`, `categories`, `budgets`, `transactions`, `recurring`. Indexes on `userId`, `month`, `accountId`, `categoryId`, `date`, `deletedAt`, `archived`.
- **Serializers**: `serializeAccount`, `serializeCategory`, `serializeBudget`, `serializeTransaction`, `serializeRecurring` — field whitelists for Firestore round-trip
- **Sync**: `syncBudgetData()` + `syncOneBudgetStore()` wired into `syncAll()`; skipped entirely when local-only is on
- **Dual-write** for all CRUD via standard `firestoreWrite()` pattern
- **Per-user isolation** — Firestore rules enforce `request.auth.uid == resource.data.userId`. No sharing for finance data.
- **Custom event**: `dm-budget-updated` fired on currency/local-only changes and wipes

### Planned — Spreadsheet workspace (Phase 4)
- Formula engine via [HyperFormula](https://hyperformula.handsontable.com/) — dependency graph, named ranges, cross-sheet refs
- Not yet loaded; listed as a future dependency

### Public API: `window.dmBudget`
| Method | Purpose |
|--------|---------|
| `getCurrency()` / `setCurrency(code)` | Default currency (localStorage-backed) |
| `isLocalOnly()` / `setLocalOnly(on)` | Toggle local-only mode |
| `eraseAllData({ eraseCloud })` | Wipe budget data (optionally including cloud) |
| `currentMonth()` | Returns current `YYYY-MM` string |
| `getAccounts()` / `getAccount(id)` / `createAccount()` / `updateAccount()` / `deleteAccount()` | Account CRUD |
| `ensureDefaultAccount()` | Creates "Main" account if none exists |
| `getCategories()` / `createCategory()` / `updateCategory()` / `deleteCategory()` | Category CRUD |
| `seedDefaultsIfEmpty()` | Seeds a starter set of expense/income categories |
| `getBudgetsForMonth(month)` / `setBudget({ month, categoryId, amount, rollover })` | Envelope allocation |
| `getTransactions({ month, categoryId, accountId })` / `createTransaction()` / `updateTransaction()` / `deleteTransaction()` | Transaction CRUD |
| `getMonthSummary(month)` | Aggregates category totals, income/expense, remaining |
| `formatMoney(cents, currency)` / `parseMoney(str)` | Money formatting helpers |
| `getRecurring()` / `getRecurringById(id)` / `createRecurring()` / `updateRecurring()` / `deleteRecurring()` | Recurring rule CRUD |
| `computeNextDate(dateStr, frequency, interval)` | Pure helper — advance a YYYY-MM-DD date by one cadence step (clamps month-end) |
| `runRecurringDue({ today?, backfillCapDays? })` | Auto-post scheduler — posts all due rules idempotently, backfills up to 90 days |

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
| `window.dmAppearance` | Theming: `setSkin()`, `setAccent()`, `setBackground()`, `setSidebarWidth()`, `reset()`, `getState()`, `SKINS`, `ACCENTS`, `BACKGROUNDS` |
| `window.dmBudget` | Budget: accounts/categories/budgets/transactions CRUD, `getCurrency()`, `setLocalOnly()`, `eraseAllData()`, `getMonthSummary()`, `formatMoney()` |
| `window.dmAppearanceBuildPanel(el)` | Mounts the Appearance controls into a container element (idempotent) |
| `window.dmIcon(name, size)` | Returns `<svg><use href="...#icon-{name}"/></svg>` markup from the Lucide sprite |
| `window.dmAuth` | Firebase Auth instance |
| `window.dmDb` | Firestore instance |
| `window.dmAuthReady` | Promise resolving when auth state is known |
| `window.dmSignIn()` | Sign-in helper (popup-first, redirect fallback) |
| `window.dmIsMobile` | Boolean for mobile device detection |
| `window.dmIsLocalhost` | Boolean for local development detection |
| `window.dmEnableCheckboxes()` | Enable interactive checkboxes in rendered markdown |
| `window._wikilinkMap` | Map of note titles to IDs for wikilink resolution |
