# Plan: Fix Tags Page & Fix Backlinks

## Feature 1: Fix Tags Page

### Problem
`tag-cloud.html` shortcode iterates over Hugo's `Site.RegularPages` which returns nothing since all content is dynamic Firestore data. Tags page shows "No tags yet" even when notes have tags.

### Step 1: Add dmSync API helpers
**File:** `themes/hugo-book/layouts/partials/dm-sync.html`
**Location:** After line 732 (after `getSnippetLanguages`), before `// Sync operations` on line 734

Add two new methods to the `window.dmSync` object:

```javascript
// Query helpers — Tags
getAllTags: function() {
  return idbGetAll(STORE_NOTES).then(function(notes) {
    var tagMap = {};
    notes.forEach(function(n) {
      if (n.tags && n.tags.length) {
        n.tags.forEach(function(t) {
          if (!tagMap[t]) tagMap[t] = 0;
          tagMap[t]++;
        });
      }
    });
    return Object.keys(tagMap).map(function(tag) {
      return { tag: tag, count: tagMap[tag] };
    }).sort(function(a, b) { return b.count - a.count || a.tag.localeCompare(b.tag); });
  });
},
getNotesByTag: function(tag) {
  return idbGetAll(STORE_NOTES).then(function(notes) {
    return notes.filter(function(n) {
      return n.tags && n.tags.indexOf(tag) !== -1;
    });
  });
},
```

### Step 2: Rewrite tag-cloud.html
**File:** `themes/hugo-book/layouts/shortcodes/tag-cloud.html`
**Action:** Replace entire file

Follow the `section-notes.html` pattern:
- Static HTML skeleton with auth/loading/empty/content states
- `<div class="tag-cloud">` for the pills
- `<div class="tag-cloud-notes">` for filtered notes when a tag is clicked
- Inline `<script>` that:
  1. Auth-gates with `window.dmAuth.onAuthStateChanged()`
  2. Calls `window.dmSync.getAllTags()` to get tag data
  3. Renders clickable tag pills with counts (pills are `<button>` elements)
  4. On pill click: calls `window.dmSync.getNotesByTag(tag)`, renders note cards below
  5. Active pill gets `.tag-pill-active` class
  6. Clicking active pill again deselects it (clears filter)
  7. Listens for `dm-sync-complete` to re-render

HTML skeleton:
```html
<div class="tag-cloud-container" id="tag-cloud-container">
  <div class="tag-cloud-auth" style="display: none;">
    <!-- Same auth card as section-notes -->
  </div>
  <div class="tag-cloud-loading" style="display: none;">
    <div class="tag-cloud-spinner"></div>
    <span>Loading tags...</span>
  </div>
  <div class="tag-cloud-empty" style="display: none;">
    <p>No tags yet. Add tags to your notes to see them here.</p>
  </div>
  <div class="tag-cloud" style="display: none;"></div>
  <div class="tag-cloud-filter-info" style="display: none;">
    <!-- Shows "Showing X notes tagged 'foo'" with clear button -->
  </div>
  <div class="tag-cloud-notes"></div>
</div>
```

### Step 3: Add CSS for active/selected state and filtered note list
**File:** `themes/hugo-book/assets/_custom.scss`
**Location:** After the existing `.tag-pill` block (line ~1460)

Add:
```scss
.tag-pill-active,
.tag-pill-active:visited {
  background: var(--accent-blue);
  border-color: var(--accent-blue);
  color: #fff;

  .tag-count {
    background: rgba(255,255,255,0.2);
    color: #fff;
  }
}

.tag-cloud-filter-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  background: var(--surface-1);
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.tag-cloud-filter-clear {
  background: none;
  border: none;
  color: var(--color-link);
  cursor: pointer;
  font-size: 0.85rem;
}

.tag-cloud-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2rem 0;
  justify-content: center;
  color: var(--gray-500);
}

.tag-cloud-spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--gray-200);
  border-top-color: var(--color-link);
  border-radius: 50%;
  animation: sn-spin 0.8s linear infinite;
}
```

Note cards in `.tag-cloud-notes` will reuse the existing `.section-notes-card` styles.

---

## Feature 2: Fix Backlinks

### Design Decisions
- **Wikilinks `[[Note Title]]`** as primary mechanism (explicit, rendered as clickable links)
- **Title matching** as secondary signal (automatic, lower confidence)
- **Display:** "Linked from" section at bottom of note viewer
- **Dead code cleanup:** Remove `component/backlinks.html`

### Step 1: Delete dead backlinks.html
**File:** `themes/hugo-book/layouts/partials/component/backlinks.html`
**Action:** Delete file

### Step 2: Add wikilink support to marked.js renderer
**File:** `themes/hugo-book/layouts/partials/docs/inject/body.html`
**Location:** Wherever `marked.parse()` or `marked.setOptions()` is configured

Add a custom `marked` extension that:
1. Tokenizes `[[Note Title]]` patterns in inline text
2. In the renderer, looks up the note by title in IndexedDB
3. Renders as `<a href="/digital-memory/docs/view/?id=NOTE_ID" class="wikilink">Note Title</a>`
4. If note not found, renders as `<span class="wikilink wikilink-missing">Note Title</span>`

The extension uses marked's `extensions` API:
```javascript
var wikilinkExtension = {
  name: 'wikilink',
  level: 'inline',
  start: function(src) { return src.indexOf('[['); },
  tokenizer: function(src) {
    var match = /^\[\[([^\]]+)\]\]/.exec(src);
    if (match) {
      return { type: 'wikilink', raw: match[0], title: match[1].trim() };
    }
  },
  renderer: function(token) {
    // Look up note by title from a pre-built map
    var note = window._wikilinkMap && window._wikilinkMap[token.title.toLowerCase()];
    if (note) {
      return '<a href="' + viewUrl(note.id) + '" class="wikilink">' + escapeHtml(token.title) + '</a>';
    }
    return '<span class="wikilink wikilink-missing">' + escapeHtml(token.title) + '</span>';
  }
};
marked.use({ extensions: [wikilinkExtension] });
```

Before rendering any note, build `window._wikilinkMap` from all notes:
```javascript
function buildWikilinkMap(notes) {
  var map = {};
  notes.forEach(function(n) {
    if (n.title) map[n.title.toLowerCase()] = n;
  });
  window._wikilinkMap = map;
}
```

### Step 3: Add getBacklinksForNote() to dmSync
**File:** `themes/hugo-book/layouts/partials/dm-sync.html`
**Location:** After the tag query helpers added in Feature 1

```javascript
getBacklinksForNote: function(noteId) {
  return idbGetAll(STORE_NOTES).then(function(notes) {
    var targetNote = null;
    notes.forEach(function(n) { if (n.id === noteId) targetNote = n; });
    if (!targetNote || !targetNote.title) return [];

    var results = [];
    var titleLower = targetNote.title.toLowerCase();
    var wikilinkPattern = new RegExp('\\[\\[' + targetNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\]', 'i');

    notes.forEach(function(n) {
      if (n.id === noteId) return;
      if (!n.content) return;

      var isExplicit = wikilinkPattern.test(n.content);
      var isTitleMatch = !isExplicit && titleLower.length > 3 && n.content.toLowerCase().indexOf(titleLower) !== -1;

      if (isExplicit || isTitleMatch) {
        results.push({
          note: n,
          type: isExplicit ? 'wikilink' : 'mention',
          confidence: isExplicit ? 'high' : 'medium'
        });
      }
    });

    // Sort: explicit wikilinks first, then mentions; within each group by date
    return results.sort(function(a, b) {
      if (a.type !== b.type) return a.type === 'wikilink' ? -1 : 1;
      return (b.note.updatedAt || 0) - (a.note.updatedAt || 0);
    });
  });
},
```

Note: Title matching has a minimum length of 4 characters to avoid false positives with very short titles.

### Step 4: Add "Linked from" section to note viewer
**File:** `themes/hugo-book/layouts/shortcodes/note-viewer.html` (or wherever the individual note is rendered)

After the note content is rendered, add:
```html
<div class="backlinks-section" id="backlinks-section" style="display: none;">
  <h3 class="backlinks-title">Linked from</h3>
  <div class="backlinks-list" id="backlinks-list"></div>
</div>
```

JavaScript (after note content renders):
```javascript
function loadBacklinks(noteId) {
  if (!window.dmSync || !window.dmSync.getBacklinksForNote) return;
  window.dmSync.getBacklinksForNote(noteId).then(function(results) {
    var section = document.getElementById('backlinks-section');
    var list = document.getElementById('backlinks-list');
    if (!results.length) { section.style.display = 'none'; return; }
    
    var html = '';
    results.forEach(function(r) {
      var badge = r.type === 'wikilink' 
        ? '<span class="backlink-badge backlink-explicit">linked</span>'
        : '<span class="backlink-badge backlink-mention">mentioned</span>';
      html += '<a class="backlink-card" href="' + viewUrl(r.note.id) + '">'
        + '<span class="backlink-card-title">' + escapeHtml(r.note.title || 'Untitled') + '</span>'
        + badge
        + '</a>';
    });
    list.innerHTML = html;
    section.style.display = '';
  });
}
```

CSS (in `_custom.scss`):
```scss
.backlinks-section {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--gray-200);
}

.backlinks-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.backlinks-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.backlink-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  text-decoration: none;
  color: var(--body-font-color);
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--color-link);
  }
}

.backlink-card-title {
  font-size: 0.85rem;
  font-weight: 500;
}

.backlink-badge {
  font-size: 0.7rem;
  padding: 1px 8px;
  border-radius: 10px;
}

.backlink-explicit {
  background: rgba(var(--accent-blue-rgb, 0,105,255), 0.1);
  color: var(--accent-blue);
}

.backlink-mention {
  background: var(--gray-100);
  color: var(--text-faint);
}

.wikilink {
  color: var(--color-link);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.wikilink-missing {
  color: var(--color-danger);
  text-decoration: underline;
  text-decoration-style: dashed;
  cursor: help;
}
```

### Step 5: Wire backlink edges into graph.js
**File:** `themes/hugo-book/assets/js/graph.js`
**Location:** Inside `buildGraphFromNotes()` function

After the existing tag-based edge building, add wikilink/mention scanning:

```javascript
// Build backlink edges from wikilinks and title mentions
var titleMap = {};
graphNodes.forEach(function(node) {
  if (node.title) titleMap[node.title.toLowerCase()] = node.id;
});

graphNodes.forEach(function(node) {
  if (!node.content) return;
  
  // Scan for [[wikilinks]]
  var wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  var match;
  while ((match = wikilinkRegex.exec(node.content)) !== null) {
    var targetTitle = match[1].trim().toLowerCase();
    var targetId = titleMap[targetTitle];
    if (targetId && targetId !== node.id) {
      graphEdges.push({
        source: node.id,
        target: targetId,
        type: 'backlink'
      });
    }
  }
  
  // Scan for title mentions (secondary, lower confidence)
  Object.keys(titleMap).forEach(function(title) {
    if (title.length <= 3) return;
    var targetId = titleMap[title];
    if (targetId === node.id) return;
    // Skip if already linked via wikilink
    var alreadyLinked = graphEdges.some(function(e) {
      return e.source === node.id && e.target === targetId && e.type === 'backlink';
    });
    if (alreadyLinked) return;
    if (node.content.toLowerCase().indexOf(title) !== -1) {
      graphEdges.push({
        source: node.id,
        target: targetId,
        type: 'backlink'
      });
    }
  });
});
```

The graph already has visual styling for `backlink` type edges (distinct from `tag` edges), so no additional D3 styling changes are needed.

---

## Files Modified Summary

| File | Action | Feature |
|------|--------|---------|
| `dm-sync.html` | Add `getAllTags()`, `getNotesByTag()`, `getBacklinksForNote()` | Both |
| `tag-cloud.html` | Full rewrite | Tags |
| `_custom.scss` | Add tag-active, backlinks, wikilink styles | Both |
| `body.html` | Add marked.js wikilink extension + wikilinkMap builder | Backlinks |
| `note-viewer.html` | Add "Linked from" section | Backlinks |
| `graph.js` | Add wikilink/mention edge building in `buildGraphFromNotes()` | Backlinks |
| `component/backlinks.html` | Delete | Backlinks |
