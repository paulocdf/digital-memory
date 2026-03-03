# Digital Memory

A personal knowledge management system — connecting ideas, books, and notes. Built as a local-first web application on top of Hugo, with IndexedDB as the primary data store and optional Firestore cloud sync.

## About

Digital Memory is a self-hosted digital garden that combines note-taking, task management, spaced repetition, and analytics into a single client-side application. All ~40,000 lines of JavaScript run directly in the browser with no server-side logic — data lives in IndexedDB first, with Firebase providing authentication and cloud sync.

## Features

### Knowledge Management
- **Notes & Sections** — Organized into Books, Topics, Snippets, and Inbox. Markdown editor with toolbar and live preview, wikilinks (`[[Note Title]]`), backlinks, note pinning, and tag cloud.
- **Knowledge Graph** — D3.js force-directed graph on the landing page. Nodes represent notes; edges are derived from wikilinks and title mentions.
- **Full-Text Search** — FlexSearch-powered search indexed from IndexedDB, with keyboard shortcuts (`Ctrl/Cmd+K`).
- **Version History** — LCS diff viewer with restore and delete support, up to 50 versions per note.
- **Diagrams** — Mermaid and Kroki (PlantUML, D2, GraphViz) rendering with fullscreen lightbox.

### Task Management
- **Inbox** — CRUD tasks with subtasks, categories, estimated/actual duration tracking, scheduled dates, and Bullet Journal rapid-logging. AI-assisted natural language task creation.
- **Kanban Board** — Three-column drag-and-drop board (To Do / In Progress / Done) with status sync.
- **Projects** — Group tasks by project with color coding, archive support, and inline Pomodoro timer.
- **Task Sharing** — Share tasks by email with real-time collaboration via Firestore.
- **Quick Capture** — Four modes (AI, Note, Code, Todo) accessible via keyboard shortcut, with `Tab` to cycle modes.

### Productivity
- **Pomodoro Timer** — Floating draggable widget with configurable work/break durations, multi-session support, Focus/Zen mode (full-screen ambient visualizer), cross-device sync, and push notifications. All sounds synthesized via Web Audio API.
- **Spaced Repetition** — SM-2 algorithm flashcard review with quality ratings, keyboard-driven interface, and schedule tracking.
- **Dashboard** — D3.js donut charts (time by category/project), bar charts (daily/weekly/monthly activity), stat cards, and period-over-period comparisons.
- **History** — Calendar grid view of past task activity.

### AI
- **AI Companion** — In-browser LLM (Qwen2.5-0.5B-Instruct via WebLLM/WebGPU). Runs entirely client-side — no API keys, no server calls. Task-aware system prompt with voice input support.

### General
- **Export** — Bulk and per-item export (notes, tasks, flashcards, books) as ZIP via JSZip.
- **Trash** — Soft delete with restore, permanent delete, and 30-day auto-purge.
- **PWA** — Installable as a progressive web app with service worker caching and push notifications.
- **Keyboard Shortcuts** — Press `?` to view all shortcuts, organized by context.
- **Dark Mode** — Auto-detects OS preference with manual toggle.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Static site generator | Hugo (extended) |
| Theme | hugo-book (forked, git submodule) |
| Frontend | Vanilla JavaScript (no framework, no bundler) |
| Styling | SCSS via Hugo asset pipeline |
| Local database | IndexedDB |
| Cloud sync | Firebase Firestore |
| Authentication | Firebase Auth (Google sign-in) |
| File storage | Firebase Storage |
| AI | WebLLM (Qwen2.5-0.5B-Instruct, WebGPU) |
| Charts & graph | D3.js v7 |
| Search | FlexSearch |
| Drag & drop | SortableJS |
| Markdown | marked.js |
| Syntax highlighting | highlight.js |
| Diagrams | Mermaid, Kroki |
| Export | JSZip |
| Testing | Playwright |
| CI/CD | GitHub Actions |

## Project Structure

```
digital-memory/
├── config.toml                        # Hugo configuration
├── Makefile                           # make run -> hugo server -D
├── firebase.json                      # Firebase project config
├── firestore.rules                    # Firestore security rules
├── storage.rules                      # Firebase Storage rules
├── package.json                       # Playwright test dependencies
├── playwright.config.ts               # E2E test configuration
│
├── content/
│   ├── _index.md                      # Landing page (graph + stats)
│   └── docs/
│       ├── ai.md                      # AI chat page
│       ├── board.md                   # Kanban board
│       ├── dashboard.md               # Analytics dashboard
│       ├── history.md                 # Calendar history
│       ├── projects.md                # Projects page
│       ├── review.md                  # Spaced repetition
│       ├── trash.md                   # Trash
│       ├── view.md                    # Note viewer
│       ├── books/                     # Books section
│       ├── inbox/                     # Task management section
│       ├── snippets/                  # Code snippets section
│       └── topics/                    # Topics section
│
├── themes/hugo-book/                  # Forked theme (git submodule)
│   ├── layouts/
│   │   ├── partials/
│   │   │   ├── dm-sync.html           # Data sync engine
│   │   │   ├── todo-list.html         # Task management
│   │   │   ├── pomodoro-timer.html    # Pomodoro timer
│   │   │   ├── ai-companion.html      # AI engine
│   │   │   ├── todo-edit-modal.html   # Task edit modal
│   │   │   ├── note-edit-modal.html   # Note editor
│   │   │   ├── export-modal.html      # Export modal
│   │   │   ├── search-modal.html      # Search
│   │   │   └── ...
│   │   └── shortcodes/
│   │       ├── kanban-board.html      # Kanban board
│   │       ├── ai-chat.html           # AI chat interface
│   │       ├── review-queue.html      # Spaced repetition
│   │       ├── dashboard.html         # Analytics
│   │       ├── note-viewer.html       # Note viewer
│   │       └── ...
│   ├── assets/
│   │   ├── _custom.scss               # All custom styles
│   │   ├── js/graph.js                # D3.js knowledge graph
│   │   ├── sw.js                      # Service worker
│   │   └── manifest.json              # PWA manifest
│   └── static/js/vendor/              # Bundled libraries (D3, FlexSearch, Mermaid)
│
├── tests/                             # Playwright E2E tests (~260 tests)
│   ├── keyboard-shortcuts.spec.ts
│   ├── landing-page.spec.ts
│   ├── pomodoro-timer.spec.ts
│   ├── review.spec.ts
│   ├── search-modal.spec.ts
│   └── ...
│
└── .github/workflows/
    └── gh-pages.yml                   # CI: test + build + deploy
```

## Getting Started

### Prerequisites

- [Hugo](https://gohugo.io/installation/) 0.124.1+ (extended edition)
- [Node.js](https://nodejs.org/) 20+ (only needed for running tests)

### Running Locally

```bash
# Clone with submodules (the theme is a git submodule)
git clone --recurse-submodules https://github.com/paulocdf/digital-memory.git
cd digital-memory

# Start the development server
make run
# or directly:
hugo server -D
```

The site will be available at `http://localhost:1313/digital-memory/`.

## Testing

The project uses Playwright for end-to-end testing (~260 tests across 15 spec files).

```bash
# Install dependencies
npm ci

# Install Playwright browsers
npx playwright install --with-deps chromium

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode
npm run test:headed

# View test report
npm run test:report
```

The Playwright config automatically starts a Hugo dev server on port 1313 when running tests.

## Deployment

Deployment is automated via GitHub Actions. Pushing to `main` triggers:

1. Checkout with submodules
2. Run Playwright E2E tests (must pass)
3. Build with `hugo --minify`
4. Deploy to GitHub Pages via the `gh-pages` branch

Pull requests run the test suite without deploying.

## Architecture

### Local-First

IndexedDB is the primary data store (9 object stores). All reads come from IndexedDB; writes go to both IndexedDB and Firestore via a dual-write pattern. Offline writes are queued and drained on reconnect. The app is fully functional without an internet connection.

### No Build System

All JavaScript is inline within Hugo HTML partials and shortcodes. There is no npm build step, no bundler, no transpilation, and no module system. Hugo's asset pipeline handles only SCSS compilation.

### Component Communication

Components communicate via `window.dm*` globals (e.g., `window.dmSync`, `window.dmPomodoro`, `window.dmAI`) and custom DOM events (`dm-sync-complete`, `dm-todos-updated`, `dm-pomodoro-stopped`, etc.).

### Content Pages

Each content `.md` file is a thin wrapper — front matter plus a single Hugo shortcode invocation (e.g., `{{< kanban-board >}}`). All logic lives in the shortcode and partial HTML files within the theme.

## License

[MIT](LICENSE) — Copyright (c) 2022 Paulo Figueiredo
