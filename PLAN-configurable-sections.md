# Plan — Configurable Note Sections

> Goal: let users rename the four built-in sections (Inbox, Topics, Books, Snippets) and add their own user-defined flat sections (e.g. "Recipes", "Papers", "D&D"), without breaking existing data and without a Hugo rebuild for every new section.

## Mission alignment

The "memory garden" is supposed to be *the user's* taxonomy. Hardcoding "Books / Topics / Snippets" is opinionated in a way that fights the mission for users whose garden is recipes, climbing routes, sermon notes, paper reviews, etc. This change makes the section model match the rest of the app's local-first, user-shaped philosophy (same spirit as freeform task categories and freeform note tags).

## Scope (chosen)

- **Layer 1 — Rename built-ins.** Per-user display labels for `inbox`, `topic`, `book-note`, `snippets`. Data model untouched.
- **Layer 2 — User-defined flat sections.** New `noteSections` IDB+Firestore collection. Notes carry `destination: 'section:<id>'`. Rendered via a single dynamic Hugo route `/docs/sections/?id=<id>`.
- **Layer 3 — Hide/archive any section** (built-in or custom) from sidebar + garden.
- **Quick Capture UX.** Built-ins remain pinned as primary buttons; custom sections appear under a "More…" dropdown.

Out of scope (defer):
- Custom *grouped* sections (clones of Books/Snippets that group by a custom field).
- Migrating built-ins themselves into rows of `noteSections`.
- Multi-level / nested sections.

---

## Data model

### New collection: `noteSections`

```js
{
  id,             // e.g. 'sec-<random>' for custom; or built-in id (see below)
  userId,
  name,           // user-facing label, e.g. "Recipes"
  slug,           // url-safe slug, unique per user, e.g. "recipes"
  icon,           // Lucide sprite name, default 'book-open'
  emoji,          // optional emoji prefix for sidebar/garden
  order,          // fractional order
  archived,       // boolean — hides from sidebar + garden + Quick Capture
  builtin,        // boolean — true for the four pre-seeded rows
  builtinKey,     // 'inbox' | 'topic' | 'book-note' | 'snippets' (only when builtin)
  createdAt, updatedAt, deletedAt
}
```

### Built-ins as overlay rows (not migration)

We do **not** migrate notes. Notes keep their existing `destination` values (`'inbox'`, `'topic'`, `'book-note'`, `'snippets'`). Instead, on first sign-in we seed four `noteSections` rows with `builtin: true` and stable IDs (`builtin-inbox`, `builtin-topic`, `builtin-book-note`, `builtin-snippets`). These rows hold the user's *display label override* for a built-in.

Resolution order at render time:
1. If `note.destination` starts with `section:` → look up section by id.
2. Else map legacy destination → built-in section row by `builtinKey`.

This means existing accounts work untouched; the only addition is four overlay rows per user.

### Notes change (additive)

`note.destination` accepts a new shape:
- Legacy: `'inbox' | 'topic' | 'book-note' | 'snippets'` (kept forever)
- New: `'section:<sectionId>'` for custom user sections

Add `destination` field to `serializeNote()` allowlist (already there) — no schema change beyond convention.

### IndexedDB

- Bump version: **v20 → v21**.
- Add object store `noteSections` with indexes on `userId`, `slug`, `archived`, `deletedAt`.
- Upgrade logic in `dm-sync.html` `onupgradeneeded`.

### Firestore

- Add rules block for `noteSections` (per-user isolation, mirror of `categories`/`accounts`).
- **Must deploy rules** with the `firebase-deploy` skill — repo edit alone is insufficient.

---

## API surface — `window.dmSync`

New methods (mirror the `categories` pattern):

| Method | Purpose |
|---|---|
| `getNoteSections({ includeArchived, includeDeleted })` | Returns rows from IDB |
| `getNoteSection(id)` | Single lookup |
| `getNoteSectionBySlug(slug)` | Used by the dynamic `/docs/sections/` route |
| `resolveSectionForNote(note)` | Returns the section row a note belongs to (handles legacy destinations) |
| `createNoteSection({ name, icon, emoji })` | Slug auto-generated from name with collision handling |
| `updateNoteSection(id, patch)` | Rename, change icon, reorder, archive |
| `deleteNoteSection(id)` | Soft delete via `deletedAt`. Refuses if `builtin === true`. Notes inside become "orphaned" but still exist in trash-restorable form (see "Section deletion" below). |
| `archiveNoteSection(id)` / `unarchiveNoteSection(id)` | Toggles `archived` |
| `seedBuiltinNoteSections()` | Idempotent; runs on first sign-in and after upgrade |

All mutations go through `firestoreWrite()` (dual-write).

Custom event: `dm-note-sections-updated` fired on CRUD, so sidebar / garden / Quick Capture / section pages all repaint.

---

## Hugo routing — single dynamic page for all custom sections

Hugo is static; we cannot mint a per-user route at build time. The trick:

- Create `content/docs/sections/_index.md` rendered by `themes/hugo-book/layouts/shortcodes/section-page.html`.
- The shortcode reads `?id=<sectionId>` (or `?slug=<slug>`) from `location.search` on the client and:
  1. Looks up the section row.
  2. Sets the page heading + breadcrumb from it.
  3. Calls `<section-notes destination="section:<id>">` (existing shortcode, parametrized).

Existing `section-notes.html` already filters by `destination`. We extend it so a `destination` value of `section:<id>` is treated as a flat list (same UI as Topics) — most of its display logic already supports the flat fallback at line 346 (`Flat list of cards (topics, etc.)`).

For built-ins we keep their existing dedicated routes (`/docs/books/`, `/docs/topics/`, `/docs/snippets/`, `/docs/inbox/`) for back-compat and bookmarking. Their pages will read the user's renamed label from `dmSync.resolveSectionForNote` / `getNoteSection('builtin-...')` and update titles/breadcrumbs at render time.

---

## UI changes

### Settings panel — new "Sections" group

Lives in the appearance/settings sidebar panel. Lists all sections (built-in + custom + archived). Each row:
- Drag handle (reorder)
- Icon picker (Lucide sprite)
- Optional emoji
- Name input (rename inline)
- Slug input (custom only; built-ins show a read-only slug)
- Archive toggle
- Delete (custom only — built-ins can be archived but never deleted)

"+ New section" button opens an inline form (name, optional icon/emoji). Name auto-suggests slug.

### Sidebar (`renderDynamicSidebar` in `body.html`)

Replace the hardcoded Topics / Books / Snippets blocks with a loop over `dmSync.getNoteSections({ includeArchived: false })` sorted by `order`. Each section renders the same way Topics renders today (flat list, max 5, "View all" link). Built-ins keep their grouping behaviors:
- `book-note` → groups by `bookTitle` (unchanged)
- `snippets` → groups by `language` (unchanged)
- `topic` and all custom sections → flat list

Built-in icon defaults are preserved if the user hasn't picked an icon override.

### Garden landing page (`garden-sections.html`)

Loop over the user's non-archived sections instead of hardcoding Books + Topics. Show up to N section cards in `order`. The section card title respects the user's renamed label.

### Quick Capture (`quick-capture-modal.html`, `body.html`)

- Pinned built-in buttons stay (Topics / Books / Snippets) but use the user's renamed label.
- Add a "More…" pill that opens a popover listing non-archived custom sections.
- When a custom section is picked, `noteData.destination` is set to `section:<id>`.
- Hide pinned button if that built-in is archived; if all four built-ins are archived, the dropdown becomes the primary picker.

### Note viewer (`note-viewer.html`)

Replace hardcoded `'Topics'` / `'Books'` / `'Snippets'` labels with a lookup on the note's section row. Breadcrumbs link to the section's url (built-in keeps its dedicated route; custom uses `/docs/sections/?id=<id>`).

### Misc label-fixups

These all currently hardcode `{ 'book-note': 'Books', ... }` and need to read from the section registry instead:
- `tag-cloud.html` (line 86)
- `trash-list.html` (line 318)
- `export-modal.html` (line 756) + scope buttons (line 39, 43, 560)
- `garden-stats.html` (line 41)

### Demo mode (`dm-demo.html`)

Seed the four built-in `noteSections` rows in demo `_stores`. Optionally seed one extra custom section ("Recipes" with two notes) to advertise the new feature to signed-out visitors.

---

## Section deletion semantics

When a custom section is deleted:
- Its row gets `deletedAt`.
- Notes with `destination: 'section:<id>'` are *not* deleted, but they become "orphaned." We surface them in a small banner on the next sign-in: "3 notes belong to a removed section. Move to Inbox / restore section / send to trash."
- Built-ins cannot be deleted, only archived.

This avoids data loss while still giving a clean undo path.

---

## Migration / back-compat

- Existing notes' `destination` field is unchanged.
- Existing dedicated routes (`/docs/books/`, etc.) keep working.
- On first load after upgrade, `seedBuiltinNoteSections()` creates the four overlay rows. Idempotent — checks for `builtinKey` matches before inserting.
- IDB v21 upgrade is purely additive (new store), no migration of existing rows.
- `serializeNote()` already passes `destination` through; no change.

---

## Testing

Add Playwright spec `tests/note-sections.spec.ts` covering:
- Built-in seeding on first sign-in (idempotent across reloads).
- Renaming a built-in updates sidebar, garden, Quick Capture, note viewer breadcrumb.
- Creating a custom section appears in sidebar + Quick Capture "More…" dropdown.
- Adding a note via Quick Capture custom section persists with `destination: 'section:<id>'` and shows on `/docs/sections/?id=<id>`.
- Archiving a built-in hides it from sidebar + garden + Quick Capture but `/docs/books/` still loads (with a "this section is archived" badge).
- Deleting a custom section soft-deletes the row and shows the orphan-notes banner.
- Demo mode renders the seeded "Recipes" section.

Run via `make docker-test ARGS="tests/note-sections.spec.ts"`.

---

## Implementation order (suggested PR slices)

1. **Slice A — data layer.** IDB v21, `noteSections` store, `dmSync` API, `seedBuiltinNoteSections`, Firestore rules + deploy. No UI yet. Demo mode seed.
2. **Slice B — rename built-ins.** Settings panel "Sections" group with rename-only support for the four built-ins. Wire label resolution into sidebar, garden, Quick Capture, note viewer, tag cloud, trash, export.
3. **Slice C — custom flat sections.** Add/edit/archive custom sections. New `/docs/sections/` dynamic page. Quick Capture "More…" dropdown. Sidebar + garden loops over registry.
4. **Slice D — section deletion + orphan handling.** Soft delete, orphan-notes banner with bulk-action options.
5. **Slice E — polish.** Drag-to-reorder sections in settings, icon picker, emoji prefix, archived view in settings, demo "Recipes" section.

---

## Files touched

Core data layer:
- `themes/hugo-book/layouts/partials/dm-sync.html` — IDB v21, new store, ~10 new public methods, seed function, serializer
- `firestore.rules` — new `match /noteSections/{id}` block (deploy via `firebase-deploy` skill)

UI (Layer 2 + 3):
- `themes/hugo-book/layouts/partials/docs/inject/body.html` — `renderDynamicSidebar`, settings panel
- `themes/hugo-book/layouts/partials/quick-capture-modal.html` — More… dropdown
- `themes/hugo-book/layouts/shortcodes/section-notes.html` — accept `section:<id>` destination
- `themes/hugo-book/layouts/shortcodes/section-page.html` (new) — query-string-driven section route
- `content/docs/sections/_index.md` (new)
- `themes/hugo-book/layouts/shortcodes/garden-sections.html` — loop over registry
- `themes/hugo-book/layouts/shortcodes/garden-stats.html` — loop over registry
- `themes/hugo-book/layouts/shortcodes/note-viewer.html` — registry-driven labels + breadcrumbs
- `themes/hugo-book/layouts/shortcodes/tag-cloud.html` — registry-driven labels
- `themes/hugo-book/layouts/shortcodes/trash-list.html` — registry-driven labels
- `themes/hugo-book/layouts/partials/export-modal.html` — registry-driven labels + scope buttons

Demo + tests:
- `themes/hugo-book/layouts/partials/dm-demo.html` — seed `noteSections`, optional "Recipes" demo section
- `tests/note-sections.spec.ts` (new)

Docs:
- `AGENTS.md` — bump IDB version note (v20 → v21), add `noteSections` to object stores list
- `.context.md` — new "Note sections" section under data models + design decisions
- `FEATURES.md` — extend the Notes & Knowledge Base section

---

## Open questions to flag during implementation

- Should the `/docs/sections/?id=` URL also support `slug` for prettier links (`/docs/sections/recipes`)? Probably yes via `?slug=`, but cross-account collision-free slugs may not be globally pretty since slugs are per-user. Acceptable.
- Should custom sections support the same "single-note" mode as Inbox? Default: no, custom = flat list of multiple notes. Revisit if requested.
- Wikilink / backlink resolution is title-based and section-agnostic, so no change needed.
