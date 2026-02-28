# Digital Memory — Agent Instructions

> **Read this file first at the start of every session.** It provides project orientation and development guidance. For deeper context, see the files linked below.

## Project Overview

Digital Memory is a **personal knowledge management system** built as a Hugo static site that evolved into a fully dynamic, local-first web application. It combines note-taking, task management (with Pomodoro timer and Kanban board), spaced repetition flashcards, an in-browser AI assistant, a D3.js knowledge graph, and an analytics dashboard. All data lives in IndexedDB (primary) with Firestore cloud sync. There is no backend server — everything runs client-side.

**Live site**: `https://paulocdf.github.io/digital-memory/`

## Related Documentation

| File | Purpose | When to Read |
|------|---------|--------------|
| `CONVENTIONS.md` | Code patterns, dual-write, modal pattern, event system, gotchas | Before writing any code |
| `.context.md` | Data models, design decisions, architecture details | When working with data or making design choices |
| `FEATURES.md` | Complete feature inventory with file locations | When understanding what exists or adding to a feature |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Static site generator | Hugo 0.124.1 (extended) |
| Theme | `hugo-book` (forked, git submodule at `themes/hugo-book/`) |
| Frontend | Vanilla JavaScript — no framework, no bundler, no npm, no transpilation |
| Styling | SCSS (Hugo asset pipeline: `_custom.scss`, `_graph.scss`) |
| Database | Firebase Firestore SDK 10.14.1 (cloud sync) + IndexedDB (local-first primary store) |
| Auth | Firebase Auth (Google sign-in) |
| Storage | Firebase Storage (file attachments, 10 MB max) |
| AI | WebLLM (Qwen2.5-0.5B-Instruct) — runs entirely in-browser via WebGPU |
| Charts | D3.js v7 (bundled locally at `static/js/vendor/d3.min.js`) |
| Drag & drop | SortableJS v1.15.6 (CDN) |
| Markdown | marked.js v15 + highlight.js v11 (client-side) |
| Search | FlexSearch v0.6.30 (bundled locally) |
| ZIP export | JSZip v3.10.1 (CDN) |
| PWA | Service worker + web app manifest |

## Architecture Principles

1. **Local-first**: IndexedDB is the primary data store. Firestore is the sync layer. Reads come from IDB; writes go to both IDB and Firestore via `firestoreWrite()`.
2. **No build system**: All JavaScript is inline within Hugo HTML partials and shortcodes. No npm, no bundler, no module system. ~40,000+ lines of custom code.
3. **Global API pattern**: Components communicate via `window.dmXxx` globals (e.g., `window.dmSync`, `window.dmPomodoro`, `window.dmAI`).
4. **Modal pattern**: HTML in a Hugo partial, included via `inject/body.html`, exposes `window.dmXxx = { open, close }`.
5. **Script loading order**: Firebase SDK (synchronous, `<head>`) -> page content -> `dm-sync.html` partial -> `inject/body.html` partial.
6. **Dual-write**: Every data mutation goes through `firestoreWrite()` which writes IDB first (optimistic), then Firestore. Offline writes are queued and drained on reconnect.

## File Map

### Core Engine
| File | Lines | Description |
|------|-------|-------------|
| `themes/hugo-book/layouts/partials/dm-sync.html` | ~3,100 | Data sync engine: IndexedDB + Firestore sync, offline queue, ~40+ public methods via `window.dmSync` |
| `themes/hugo-book/layouts/partials/docs/inject/head.html` | ~110 | Firebase SDK loading + initialization, auth setup |
| `themes/hugo-book/layouts/partials/docs/html-head.html` | ~1,070 | SDK scripts, marked.js, highlight.js, SortableJS, utilities |
| `themes/hugo-book/layouts/partials/docs/inject/body.html` | ~3,980 | Quick Capture modal logic, sidebar, ToC builder, sharing UI, settings panel |

### Features
| File | Lines | Description |
|------|-------|-------------|
| `themes/hugo-book/layouts/partials/todo-list.html` | ~6,360 | Task management (Inbox): CRUD, subtasks, BuJo, drag-and-drop, finish time, `window.dmTodoList` API |
| `themes/hugo-book/layouts/partials/pomodoro-timer.html` | ~4,080 | Pomodoro timer: floating widget, Focus/Zen mode, ambient visualizer, cross-device sync |
| `themes/hugo-book/layouts/shortcodes/kanban-board.html` | ~1,670 | Kanban board: 3 columns, drag-and-drop between columns |
| `themes/hugo-book/layouts/shortcodes/dashboard.html` | ~820 | Analytics dashboard: charts, stat cards, time filters |
| `themes/hugo-book/assets/js/graph.js` | ~1,860 | D3.js knowledge graph on landing page |
| `themes/hugo-book/layouts/partials/ai-companion.html` | ~2,260 | AI engine: WebLLM, NLP parsing, voice input, task-aware system prompt |
| `themes/hugo-book/layouts/shortcodes/ai-chat.html` | ~1,280 | Full-page AI chat interface |
| `themes/hugo-book/layouts/shortcodes/review-queue.html` | ~1,230 | Spaced repetition: SM-2 algorithm, flashcard UI |
| `themes/hugo-book/layouts/partials/note-edit-modal.html` | ~1,270 | Note editor: toolbar, preview, tags, drag-drop upload |
| `themes/hugo-book/layouts/partials/todo-edit-modal.html` | ~1,840 | Task edit modal: all task fields, sharing UI |
| `themes/hugo-book/layouts/partials/export-modal.html` | ~1,240 | Bulk & single-item export (ZIP via JSZip) |
| `themes/hugo-book/layouts/partials/version-history-modal.html` | ~570 | Note version history with LCS diff |
| `themes/hugo-book/layouts/partials/todo-complete-modal.html` | ~610 | Task completion modal |
| `themes/hugo-book/layouts/partials/quick-capture-modal.html` | ~355 | Quick Capture modal markup and styles |
| `themes/hugo-book/layouts/partials/confirm-dialog.html` | ~290 | Confirmation and alert dialog |
| `themes/hugo-book/layouts/partials/keyboard-shortcuts.html` | ~250 | Keyboard shortcuts help panel |
| `themes/hugo-book/layouts/partials/search-modal.html` | ~25 | Search modal markup |
| `themes/hugo-book/layouts/shortcodes/note-viewer.html` | ~1,100 | Single note viewer with backlinks |
| `themes/hugo-book/layouts/shortcodes/single-note.html` | ~980 | Page-level note display |
| `themes/hugo-book/layouts/shortcodes/section-notes.html` | ~520 | Section note listing (Books, Topics, Snippets) |
| `themes/hugo-book/layouts/shortcodes/trash-list.html` | ~670 | Trash: restore, permanent delete, auto-purge 30 days |
| `themes/hugo-book/layouts/shortcodes/tag-cloud.html` | ~340 | Dynamic tag cloud |
| `themes/hugo-book/layouts/shortcodes/note-history.html` | ~880 | Calendar view of task activity |
| `themes/hugo-book/layouts/shortcodes/graph.html` | ~60 | Knowledge graph shortcode |
| `themes/hugo-book/layouts/shortcodes/garden-sections.html` | ~160 | Garden sections overview on landing page |
| `themes/hugo-book/layouts/shortcodes/garden-stats.html` | ~80 | Garden statistics on landing page |
| `themes/hugo-book/layouts/shortcodes/import-notes.html` | ~170 | Note import utility |

### Styles
| File | Lines | Description |
|------|-------|-------------|
| `themes/hugo-book/assets/_custom.scss` | ~6,080 | All custom styles (sidebar, settings, Quick Capture, diagrams) |
| `themes/hugo-book/assets/_defaults.scss` | — | CSS custom properties |
| `themes/hugo-book/assets/scss/_graph.scss` | — | Graph-specific styles |
| Inline in partials | — | Edit modal, todo-list action buttons, some component styles |

### Config & Rules
| File | Description |
|------|-------------|
| `config.toml` | Hugo config (baseURL, theme, BookServiceWorker) |
| `firestore.rules` | Firestore security rules (~200 lines): notes, todos, taskShares, users, timerState, etc. |
| `storage.rules` | Firebase Storage rules (10 MB max, content type whitelist) |
| `content/menu/index.md` | Sidebar navigation menu |

### Content Pages (`content/docs/`)
`board.md`, `dashboard.md`, `ai.md`, `review.md`, `history.md`, `tags.md`, `trash.md`, `view.md`, `import-notes.md`, `inbox/_index.md`, `books/_index.md`, `topics/_index.md`, `snippets/_index.md`

## How to Develop

### Running Locally

```bash
make run
# or
hugo server --disableFastRender
```

### Adding a New Feature (Checklist)

1. Identify which file(s) to modify (see File Map above)
2. Write all JS inline in the Hugo partial or shortcode — no external JS files
3. For any data changes, use the `firestoreWrite()` dual-write pattern (see `CONVENTIONS.md`)
4. If adding a new Firestore field to todos: **update `serializeTodo()` in `dm-sync.html`** (CRITICAL — fields not in this whitelist are silently dropped during sync)
5. If adding a new Firestore field to notes: **update `serializeNote()` in `dm-sync.html`**
6. If adding a new IDB object store: **increment the IDB version** (currently v12) and add upgrade logic
7. If adding a new modal: follow the modal pattern (see `CONVENTIONS.md`)
8. If adding a new page: create `content/docs/pagename.md` + shortcode + add to `content/menu/index.md`
9. Update `FEATURES.md` with the new feature
10. If the feature introduces a new design decision or pattern, update `.context.md`

### Adding a New Content Page

1. Create `content/docs/pagename.md` with Hugo front matter:
   ```markdown
   ---
   title: "Page Title"
   weight: 10
   ---
   {{</* shortcode-name */>}}
   ```
2. Create the shortcode in `themes/hugo-book/layouts/shortcodes/shortcode-name.html`
3. Add a sidebar entry in `content/menu/index.md`

### Build & Deploy

- **CI/CD**: Push to `main` triggers GitHub Actions -> Hugo build (`hugo --minify`) -> deploy to GitHub Pages
- **Submodule**: Theme changes require a commit in `themes/hugo-book/` AND a submodule pointer update in the parent repo

## Global APIs

| API | Purpose |
|-----|---------|
| `window.dmSync` | Data layer: CRUD for notes, todos, review cards, attachments, task shares. ~40+ methods |
| `window.dmPomodoro` | Timer: `start()`, `stop()`, `finish()`, `next()`, `reset()`, `pause()`, `resume()`, `togglePause()`, `isActive()`, `isTimerRunning()`, `getActiveTodoId()`, `getSessionInfo()`, `getTaskProgress(todoId)`, `clearTaskProgress(todoId)`, `getStartedAt()` |
| `window.dmTodoList` | Task list queries: `getNextTask(todoId)` — returns next undone task in same day group |
| `window.dmSounds` | Sound system: `play(soundId, volume)`, `presets`, `getVolume()` |
| `window.dmAI` | AI engine: NLP parsing, task creation, engine management |
| `window.dmTodoEdit` | Task edit modal: `open(todo, callback)` |
| `window.dmEditModal` | Note edit modal: `open(note, callback)` |
| `window.dmExport` | Export modal: `open(options)`, `close()` |
| `window.dmVersionHistory` | Version history modal: `open(note)`, `close()` |
| `window.dmTodoComplete` | Task completion modal: `open(todo, callback)`, `close()` |
| `window.dmKeyboardShortcuts` | Keyboard shortcuts panel: `open()`, `close()`, `toggle()` |
| `window.dmConfirm` | Confirmation dialog: `dmConfirm(message, onConfirm)` |
| `window.dmAlert` | Alert dialog: `dmAlert(message)` |
| `window.dmFormat` | Date/time formatting utilities |
| `window.dmCreateFlashcard` | Create flashcard from AI or other contexts |
| `window.dmRenderDiagrams` | Render Mermaid/Kroki diagrams in content |
| `window.dmAuth` | Firebase Auth instance |
| `window.dmDb` | Firestore instance |
| `window.dmStorage` | Firebase Storage instance |
| `window.dmAuthReady` | Promise — resolves when auth state is known |
| `window.dmSignIn()` | Sign-in helper (popup-first, redirect fallback) |

## Critical Rules

1. **NEVER add raw Firestore writes** — always use `window.dmSync.firestoreWrite()`. This ensures IDB-first optimistic writes and offline queue support.
2. **ALWAYS update `serializeTodo()` / `serializeNote()`** when adding new fields. Omitting a field causes silent data loss during Firestore-to-IDB sync.
3. **NEVER use npm, bundlers, or external JS files** — all code is inline in Hugo HTML partials.
4. **Firebase SDK CANNOT be deferred** — inline `firebase.initializeApp()` depends on synchronous loading.
5. **Hugo parses `{{ }}` in `<script>` blocks** — avoid Go template syntax in JS code (e.g., JSDoc `@returns {{ field }}` will break the build).
6. **IndexedDB version must increment** for schema changes (add upgrade logic in `dm-sync.html` `onupgradeneeded`).
7. **`baseURL` includes `/digital-memory/`** — all URLs are prefixed.
8. **Test manually** — there is no test infrastructure. Run `hugo server`, test in browser.
