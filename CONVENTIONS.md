# Digital Memory — Code Conventions

> Patterns, rules, and gotchas for developing in this codebase. Read `AGENTS.md` first for project orientation.

## Code Organization

- **All JavaScript is inline** within Hugo HTML partials and shortcodes — no separate `.js` files (except `graph.js` and `search.js`).
- **No npm, no bundler, no transpilation** — vanilla JS using `var`, `function`, `.forEach()`, `.then()`. No arrow functions in older files; newer additions may use them.
- **Styles**: Most live in `_custom.scss`. Some components have inline `<style>` blocks in their HTML partial (edit modal, todo-list action buttons, kanban board, pomodoro timer).
- **CDN libraries**: SortableJS, marked.js, highlight.js, JSZip loaded via CDN with SRI hashes in `html-head.html`. Firebase SDK from gstatic CDN.
- **Local libraries**: FlexSearch (`static/flexsearch.min.js`), Mermaid (`mermaid.min.js`), D3 (`js/vendor/d3.min.js`).

## Patterns

### Dual-Write via `firestoreWrite()`

Every data mutation must go through `window.dmSync.firestoreWrite()`. This writes to IndexedDB first (optimistic, instant), then queues the Firestore write. Offline writes are queued in the `writeQueue` IDB store and drained on reconnect.

```javascript
// CREATE (offline-compatible ID generation)
var newDocId = window.dmDb
  ? window.dmDb.collection('collectionName').doc().id
  : ('local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));

var localObj = { id: newDocId, userId: uid, /* ... */ createdAt: Date.now(), updatedAt: Date.now() };

window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: newDocId,
  op: 'set',
  data: { /* Firestore fields with serverTimestamp() */ },
  localOp: function() { return window.dmSync.putXxx(localObj); }
});

// UPDATE
window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: obj.id,
  op: 'update',
  data: {
    fieldName: newValue,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  },
  localOp: function() {
    obj.fieldName = newValue;
    obj.updatedAt = Date.now();
    return window.dmSync.putXxx(obj);
  }
});

// DELETE
window.dmSync.firestoreWrite({
  collection: 'collectionName',
  docId: objId,
  op: 'delete',
  data: null,
  localOp: function() { return window.dmSync.deleteXxx(objId); }
});
```

#### Documented exception: `acceptProjectShare()`

`acceptProjectShare()` in `dm-sync.html` intentionally bypasses `firestoreWrite()` and issues direct Firestore writes. The reason is a circular dependency in the security rules: the rule that lets an invitee add themselves to a project's `collaborators` array requires the matching `projectShares` doc to *already* have `status === 'accepted'` in Firestore. Going through the IDB-first queue would race the two writes and the collaborator update would land before the share status was persisted, tripping the rule.

Direct writes guarantee step 1 (share status → accepted) is durable in Firestore before step 2 (collaborator union) runs. We mirror to IDB after the fact to keep the optimistic cache invariant. Trade-off: offline accepts are not supported (the function rejects when `window.dmDb` is unavailable). This is the only sanctioned exception to the dual-write rule — see the function's JSDoc for full context. Do not pattern-match this elsewhere without explicit justification.

### Modal Pattern

Modals are Hugo partials included via `inject/body.html`. Each modal exposes a global API:

```javascript
// In the partial's <script> block:
window.dmMyModal = {
  open: function(data, callback) { /* show modal, populate fields */ },
  close: function() { /* hide modal, clean up */ }
};
```

Callers open modals like:
```javascript
window.dmMyModal.open(someData, function(result) {
  if (!result) return; // user cancelled
  // handle result
});
```

### Event System

Components communicate via custom DOM events on `document`:

| Event | Fired by | Payload | Purpose |
|-------|----------|---------|---------|
| `dm-sync-complete` | `dm-sync.html` | none | Initial sync finished; rebuild UI |
| `dm-todos-updated` | `dm-sync.html` | none | Todos changed; re-render task lists |
| `dm-attachments-updated` | `dm-sync.html` | none | Attachments changed |
| `dm-review-updated` | `dm-sync.html` | none | Review cards changed |
| `dm-task-shares-updated` | `dm-sync.html` | none | Task shares changed |
| `dm-pomodoro-stopped` | `pomodoro-timer.html` | `{ todoId, trackedMinutes, sessionsCompleted, totalSessions }` | Timer stopped or finished; cache tracked time (task NOT auto-completed) |
| `dm-pomodoro-completed` | `pomodoro-timer.html` | `{ todoId, trackedMinutes, projectId }` | User explicitly pressed Done/Next; mark task complete |
| `dm-pomodoro-state-changed` | `pomodoro-timer.html` | `{ todoId, isRunning }` | Timer state changed |
| `dm-settings-changed` | `body.html` | `{ key, value }` | User changed a setting |
| `dm-ai-state-changed` | `ai-companion.html` | `{ status }` | AI engine status changed |
| `dm-ai-load-progress` | `ai-companion.html` | `{ progress }` | AI model download progress |
| `dm-ai-create-task` | `ai-companion.html` | `{ title, scheduledDate, estimatedMin, category, projectId }` | AI suggested a task to create |
| `dm-projects-updated` | `dm-sync.html` | none | Projects changed; re-render project lists |
| `dm-project-shares-updated` | `dm-sync.html` | none | Project shares changed; re-render invitation banners |

**Listening:**
```javascript
document.addEventListener('dm-todos-updated', function() {
  // re-render
});
```

**Dispatching:**
```javascript
document.dispatchEvent(new CustomEvent('dm-my-event', { detail: { key: 'value' } }));
```

### Auth Gating

All auth-dependent code must wait for auth to be ready:

```javascript
window.dmAuthReady.then(function() {
  var user = window.dmAuth.currentUser;
  if (!user) {
    // show sign-in UI
    return;
  }
  // proceed with authenticated logic
});
```

All sign-in buttons must call `window.dmSignIn()` — never raw Firebase auth methods directly.

#### `window.dmOnAuth(callback)` — preferred listener helper

For code that needs to react to auth state changes (rather than just check the current user once via `dmAuthReady`), use **`window.dmOnAuth(callback)`** instead of `window.dmAuth.onAuthStateChanged(callback)` directly:

```javascript
// preferred — defers until dmAuth is ready, no guard needed
window.dmOnAuth(function(user) {
  if (user || (window.dmDemo && window.dmDemo.isActive())) {
    renderUI();
  } else {
    showSignInState();
  }
});

// avoid — requires manual `if (window.dmAuth)` guard at every callsite
if (window.dmAuth) {
  window.dmAuth.onAuthStateChanged(function(user) { ... });
}
```

`dmOnAuth` is defined in `head.html` immediately after Firebase initialization. It returns an unsubscribe function. If `dmAuth` is not yet available when called (rare — only matters for very early script execution), it defers registration until `dmAuthReady` resolves. Foundation code in `dm-sync.html`, `head.html`, and `dm-demo.html` calls `onAuthStateChanged` directly because those files run before or alongside the helper definition.

### Demo Mode

Signed-out visitors see curated dummy data via `window.dmDemo` (defined in `dm-demo.html`). The activation runs synchronously at page parse time when no `dm-cached-user` is in localStorage and `dm-demo-disabled` is not set; it populates an in-memory `_stores` object covering all 16 IDB collections (notes, todos, projects, kanbanColumns, reviewCards, attachments, taskShares, projectShares, accounts, categories, budgets, transactions, recurring, etc.) and then dispatches the standard refresh events (`dm-todos-updated`, `dm-projects-updated`, `dm-budget-updated`, `dm-sync-complete`, …) so every shortcode renders normally.

**Interception**: `dm-sync.html` checks `_demoActive()` inside `idbGet/GetAll/Put/Delete/Clear/PutBatch` and routes to the matching `window.dmDemo.idb*` method. `firestoreWrite()` calls `dmDemo.queueWrite()` (a no-op) so writes stay ephemeral. **`shadowClear` is intentionally a no-op** — the only callers are the dm-sync sign-out cleanup paths, and demo data is rebuilt fresh on each `activate()` anyway. Without this guard the auth-state-changed handler wipes demo fixtures right after population.

**Auth-gated code** that needs to fall through for demo:
```javascript
var user = window.dmAuth && window.dmAuth.currentUser;
if (!user && window.dmDemo && window.dmDemo.isActive()) {
  user = window.dmDemo.fakeUser(); // { uid, email, displayName, isAnonymous: true, _demo: true }
}
if (!user) { /* show sign-in */ return; }
```

When adding a new IDB store or `getAll*`/`seed*` helper in `dm-sync.html` that early-returns on missing auth, **add a demo-mode fall-through** that reads via the intercepted `idbGetAll(STORE)` (which routes to demo). See `seedDefaultKanbanColumns` for the pattern.

**Banner**: `#dm-demo-banner` (root), `#dm-demo-signin` and `#dm-demo-dismiss` controls. Hidden via `.dm-demo-banner--hidden` class (uses `visibility: hidden` so Playwright `toBeHidden()` works); dismissal persists in `dm-demo-banner-dismissed` localStorage key.

**Opt-out**: `localStorage.setItem('dm-demo-disabled', '1')` prevents activation on subsequent loads.

### SortableJS Drag-and-Drop

SortableJS instances must be **recreated on every render** because `render()` rebuilds the DOM via `innerHTML`. Pattern:

```javascript
var _sortableInstances = [];

function initSortable() {
  _sortableInstances.forEach(function(s) { s.destroy(); });
  _sortableInstances = [];
  if (typeof Sortable === 'undefined') return;

  var sortable = Sortable.create(containerEl, {
    group: 'groupName',
    animation: 150,
    onEnd: function(evt) { /* handle drop */ }
  });
  _sortableInstances.push(sortable);
}

// Call initSortable() at the end of every render()
```

### Fractional Ordering

Tasks use a fractional `order` field for position tracking. When inserting between two items:

```javascript
function calculateOrderForPosition(container, newIndex, itemId) {
  // Between two items: average their orders
  // First position: next.order - 1
  // Last position: prev.order + 1
}
```

### Icons — Use the Lucide Sprite

**Never add new inline SVG icons.** Use the Lucide sprite at `themes/hugo-book/static/icons/sprite.svg` (110 symbols).

**Hugo templates**:
```html
{{ partial "icon" "play" }}
{{ partial "icon" (dict "name" "play" "size" 16) }}
```

**JS dynamic rendering**:
```javascript
element.innerHTML = window.dmIcon('play', 16);
```

**Direct `<use>` (preferred for string-concatenated HTML in JS)**:
```html
<svg class="dm-icon dm-icon--play" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><use href="/digital-memory/icons/sprite.svg#icon-play"/></svg>
```

**Missing icon?** Add a `<symbol id="icon-NAME" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...paths...</symbol>` to `sprite.svg` (copy paths from https://lucide.dev/).

**Legitimate exceptions** (keep as inline SVG): theme sun/moon toggle, Google brand logo, progress rings (`todo-ring-*`, `focus-goal-ring-*`), BuJo state bullets, kanban pattern previews, heading-letter glyphs.

## Technical Gotchas

### Hugo

- **Template delimiters in `<script>` blocks**: Hugo parses `{{ }}` inside `<script>`. Avoid Go template syntax in JS. JSDoc `@returns {{ field }}` will break the build.
- **`jsonify` double-encodes with `--minify`**: Use `{{ $data | jsonify | safeJS }}`.
- **Shortcode comments parse delimiters**: `<!-- {{< shortcode >}} -->` causes Hugo to try to parse the shortcode.
- **`baseURL` includes `/digital-memory/`**: All URLs must be prefixed. Use `{{ "path" | relURL }}` in templates.

### Firebase / Firestore

- **SDK CANNOT be deferred**: `firebase.initializeApp()` runs synchronously and depends on SDK scripts loaded first.
- **Firestore rejects `undefined`**: Always pass explicit `null`.
- **`serverTimestamp()` corrupts in IDB**: Firebase sentinel objects lose class identity after IndexedDB structured clone. The `serializeQueueData()` / `deserializeQueueData()` helpers handle this.
- **15 `onAuthStateChanged` listeners** exist across 11 files. Each is independent — be aware of this when adding more.
- **Security rules check both `resource.data.userId` and `request.resource.data.userId`** for update operations.

### IndexedDB

- **Version is currently 18**: Schema changes require incrementing this and adding upgrade logic in `dm-sync.html` `onupgradeneeded`.
- **Version history**: v3->4 writeQueue, v4->5 noteVersions, v5->6 attachments, v6->7 reviewCards, v7->12 taskShares/indexes, v12->13 projects store + projectId index on todos, v13->14 kanbanColumns store, v14->15 projectShares store, v15->16 (internal), v16->17 budget stores, v17->18 visual identity fields on projects/todos (additive — no new stores).
- **16 object stores**: notes, todos, meta, writeQueue, noteVersions, attachments, reviewCards, taskShares, projects, kanbanColumns, projectShares, accounts, categories, budgets, transactions, recurring.

### Data Sync

- **`serializeTodo()` is a field whitelist**: Any new todo field MUST be added here or it will be silently dropped during Firestore-to-IDB sync. This is the single most common source of bugs.
- **`serializeNote()` same rule**: Must include `pinned`, `deletedAt`, and any new fields.
- **`createTodo()` takes an options object**: `{ title, estimatedMin, parentId, scheduledDate, reminderAtMs, category, atTop, pomodoroCount, pomodoroLength, onDone, source, breakLength, bujoType, projectId, color, color2 }`. Previously used 13 positional parameters; refactored to named options for clarity.
- **`project.kanbanColumnStyles`** is shaped `{ [columnId]: { accent, emoji } }` — orphan entries (column deleted) are stripped automatically when a kanban column is deleted. Don't store other keys here.

### marked.js

- **v15 renderer API**: Uses `renderer.heading = function(data)` where `data` has `.text` and `.depth` properties.
- **Renderer override order**: `renderer.code` must be set BEFORE `marked.setOptions()`.
- **Task list checkboxes**: Rendered as `<input disabled>` — `disabled` must be removed for interactivity.

### CSS

- **`--surface-bg` is not defined**: Use `--body-background` instead.
- **`color-mix()`**: Used throughout — requires modern browser support.
- **Style locations vary**: Check both `_custom.scss` and inline `<style>` blocks in the relevant partial. See `AGENT.md` File Map for specifics.

### Misc

- **Bundled Mermaid is v9.2.0**: Uses `mermaid.init()`, NOT `mermaid.run()`.
- **`sessionStorage` sidebar cache**: Uses Hugo build timestamp for invalidation.
- **ToC scroll spy**: Must defer `update()` via double `requestAnimationFrame` to avoid race conditions.
- **Wikilink map**: `window._wikilinkMap` built on `dm-sync-complete` and lazily before first `marked.parse()`.
