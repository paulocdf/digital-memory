# Plan: Multi-View Visualization Switcher

## Goal
Add the ability to cycle through multiple visualization modes for the digital garden content:
1. **Graph** (current) — D3 force-directed network
2. **Card Grid** — Pinterest-style cards
3. **Radial Sunburst** — Hierarchical circular view

## User Preferences
- Toggle UI: **Icon toggle bar** (3 circular buttons)
- Default view: **Graph**
- Persist selection in **localStorage**

---

## Implementation Tasks

### 1. Update `layouts/shortcodes/graph.html`
Add toggle bar and view containers:

```html
<div class="graph-container">
  <!-- View Toggle Bar -->
  <div class="view-toggle-bar">
    <button class="view-toggle-btn active" data-view="graph" title="Graph View">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="18" cy="8" r="3"/>
        <circle cx="12" cy="18" r="3"/>
        <line x1="8.5" y1="7.5" x2="15.5" y2="7"/>
        <line x1="7.5" y1="8.5" x2="10.5" y2="15.5"/>
        <line x1="14" y1="16" x2="16" y2="10.5"/>
      </svg>
    </button>
    <button class="view-toggle-btn" data-view="grid" title="Card Grid View">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    </button>
    <button class="view-toggle-btn" data-view="radial" title="Radial Sunburst View">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <circle cx="12" cy="12" r="7"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
    </button>
  </div>

  <!-- View Containers -->
  <div id="graph-wrapper" class="view-container active"></div>
  <div id="grid-wrapper" class="view-container"></div>
  <div id="radial-wrapper" class="view-container"></div>

  <div class="graph-legend">
    <div class="legend-item">
      <span class="legend-dot books"></span>
      <span>Books</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot topics"></span>
      <span>Topics</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot inbox"></span>
      <span>Inbox</span>
    </div>
  </div>
</div>
```

---

### 2. Add Toggle Bar & Card Grid Styles to `_custom.scss`

```scss
// =============================================================================
// VIEW TOGGLE BAR
// =============================================================================

.view-toggle-bar {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.view-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--accent-blue);
    color: var(--accent-blue);
    transform: scale(1.05);
  }

  &.active {
    background: var(--accent-blue);
    border-color: var(--accent-blue);
    color: white;
  }

  svg {
    pointer-events: none;
  }
}

// =============================================================================
// VIEW CONTAINERS
// =============================================================================

.view-container {
  display: none;

  &.active {
    display: block;
  }
}

#grid-wrapper.active {
  display: grid;
}

// =============================================================================
// CARD GRID VIEW
// =============================================================================

#grid-wrapper {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  padding: 1rem 0;
}

.grid-card {
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  border-left: 4px solid var(--accent-blue);
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    border-color: var(--border-color-hover);
  }

  // Category-specific left border colors
  &[data-category="books"] {
    border-left-color: var(--graph-books);
  }
  &[data-category="topics"] {
    border-left-color: var(--graph-topics);
  }
  &[data-category="inbox"] {
    border-left-color: var(--graph-inbox);
  }
}

.grid-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--body-font-color);
  margin-bottom: 0.5rem;
  text-decoration: none;
  display: block;

  &:hover {
    color: var(--accent-blue);
  }
}

.grid-card-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
}

.grid-card-category {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.books {
    background: rgba(var(--graph-books-rgb), 0.15);
    color: var(--graph-books);
  }
  &.topics {
    background: rgba(var(--graph-topics-rgb), 0.15);
    color: var(--graph-topics);
  }
  &.inbox {
    background: rgba(var(--graph-inbox-rgb), 0.15);
    color: var(--graph-inbox);
  }
}

.grid-card-connections {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.grid-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.grid-card-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  background: var(--surface-2);
  border-radius: 3px;
  color: var(--text-secondary);
}

.grid-card-tag-more {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  font-style: italic;
}

// Mobile: single column
@media (max-width: 600px) {
  #grid-wrapper {
    grid-template-columns: 1fr;
  }
}
```

---

### 3. Add Sunburst Styles to `_graph.scss`

```scss
// =============================================================================
// RADIAL SUNBURST VIEW
// =============================================================================

#radial-wrapper {
  width: 100%;
  height: 550px;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (max-width: 768px) {
    height: 400px;
  }
}

#radial-wrapper svg {
  width: 100%;
  height: 100%;
}

.sunburst-arc {
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
}

.sunburst-label {
  font-size: 11px;
  font-family: var(--font-mono);
  pointer-events: none;
  fill: var(--body-font-color);
}

.sunburst-center-text {
  font-size: 14px;
  font-weight: 600;
  fill: var(--body-font-color);
  text-anchor: middle;
}
```

---

### 4. Refactor `graph.js` — Major Changes

The existing `graph.js` needs to be refactored to:
1. Export the graph data fetching (cache it)
2. Add view switching logic with localStorage
3. Add `renderGridView()` function
4. Add `renderSunburstView()` function
5. Keep existing `renderGraph()` for force-directed view

#### Key additions to `graph.js`:

```javascript
// At the top - view state management
let currentView = localStorage.getItem('dm-view-mode') || 'graph';
let cachedData = null;

// Initialize view from localStorage on page load
function initializeViews() {
  const savedView = localStorage.getItem('dm-view-mode') || 'graph';
  switchView(savedView);
}

// View switching function
function switchView(viewName) {
  currentView = viewName;
  localStorage.setItem('dm-view-mode', viewName);

  // Update toggle buttons
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update view containers
  document.querySelectorAll('.view-container').forEach(container => {
    container.classList.remove('active');
  });

  const activeContainer = document.getElementById(`${viewName}-wrapper`);
  if (activeContainer) {
    activeContainer.classList.add('active');
  }

  // Render the appropriate view
  if (cachedData) {
    if (viewName === 'graph') {
      renderGraph(cachedData);
    } else if (viewName === 'grid') {
      renderGridView(cachedData);
    } else if (viewName === 'radial') {
      renderSunburstView(cachedData);
    }
  }
}

// Card Grid View Renderer
function renderGridView(data) {
  const container = document.getElementById('grid-wrapper');
  if (!container) return;

  container.innerHTML = '';

  data.nodes.forEach(node => {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.dataset.category = node.category;

    // Determine category class
    const categoryClass = node.category || 'default';

    // Build tags HTML (max 5)
    const maxTags = 5;
    const tags = node.tags || [];
    const visibleTags = tags.slice(0, maxTags);
    const extraCount = tags.length - maxTags;

    let tagsHtml = visibleTags.map(tag =>
      `<span class="grid-card-tag">${tag}</span>`
    ).join('');

    if (extraCount > 0) {
      tagsHtml += `<span class="grid-card-tag-more">+${extraCount} more</span>`;
    }

    card.innerHTML = `
      <a href="${node.path}" class="grid-card-title">${node.label}</a>
      <div class="grid-card-meta">
        <span class="grid-card-category ${categoryClass}">${node.category}</span>
        <span class="grid-card-connections">${node.number_neighbours} connection${node.number_neighbours !== 1 ? 's' : ''}</span>
      </div>
      ${tags.length > 0 ? `<div class="grid-card-tags">${tagsHtml}</div>` : ''}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A') {
        window.location.href = node.path;
      }
    });

    container.appendChild(card);
  });
}

// Radial Sunburst View Renderer
function renderSunburstView(data) {
  const container = document.getElementById('radial-wrapper');
  if (!container) return;

  container.innerHTML = '';

  const colors = getThemeColors();
  const width = container.clientWidth;
  const height = container.clientHeight;
  const radius = Math.min(width, height) / 2 - 20;

  // Build hierarchical data
  const hierarchyData = {
    name: 'Digital Memory',
    children: []
  };

  // Group nodes by category
  const categories = {};
  data.nodes.forEach(node => {
    const cat = node.category || 'default';
    if (!categories[cat]) {
      categories[cat] = [];
    }
    categories[cat].push(node);
  });

  // Convert to hierarchy structure
  Object.entries(categories).forEach(([catName, nodes]) => {
    hierarchyData.children.push({
      name: catName,
      children: nodes.map(n => ({
        name: n.label,
        path: n.path,
        value: Math.max(1, n.number_neighbours + 1), // Size by connections
        tags: n.tags,
        category: n.category
      }))
    });
  });

  // Create hierarchy
  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value || 0)
    .sort((a, b) => b.value - a.value);

  // Create partition layout
  const partition = d3.partition()
    .size([2 * Math.PI, radius]);

  partition(root);

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${width / 2}, ${height / 2})`);

  // Arc generator
  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .innerRadius(d => d.y0)
    .outerRadius(d => d.y1);

  // Color function
  const getArcColor = (d) => {
    if (d.depth === 0) return colors.nodeDefault;
    if (d.depth === 1) {
      // Category level
      const cat = d.data.name.toLowerCase();
      if (cat === 'books') return colors.nodeBooks;
      if (cat === 'topics') return colors.nodeTopics;
      if (cat === 'inbox') return colors.nodeInbox;
      return colors.nodeDefault;
    }
    // Item level - inherit from parent
    const parentCat = d.parent?.data.name?.toLowerCase() || '';
    if (parentCat === 'books') return colors.nodeBooks;
    if (parentCat === 'topics') return colors.nodeTopics;
    if (parentCat === 'inbox') return colors.nodeInbox;
    return colors.nodeDefault;
  };

  // Draw arcs
  const arcs = svg.selectAll('path')
    .data(root.descendants().filter(d => d.depth > 0)) // Skip root
    .enter()
    .append('path')
    .attr('class', 'sunburst-arc')
    .attr('d', arc)
    .attr('fill', d => getArcColor(d))
    .attr('fill-opacity', d => d.depth === 1 ? 0.7 : 0.9)
    .attr('stroke', colors.background)
    .attr('stroke-width', 2)
    .on('click', (event, d) => {
      if (d.data.path) {
        window.location.href = d.data.path;
      }
    })
    .on('mouseover', function(event, d) {
      d3.select(this).attr('fill-opacity', 1);
      // Show tooltip
      const tooltip = d3.select('.graph-tooltip');
      if (tooltip.size() > 0) {
        let content = `<strong>${d.data.name}</strong>`;
        if (d.data.category) {
          content += `<br><em>${d.data.category}</em>`;
        }
        if (d.data.tags && d.data.tags.length > 0) {
          content += `<br>Tags: ${d.data.tags.slice(0, 3).join(', ')}`;
        }
        tooltip.html(content)
          .style('opacity', 1)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      }
    })
    .on('mouseout', function(event, d) {
      d3.select(this).attr('fill-opacity', d.depth === 1 ? 0.7 : 0.9);
      d3.select('.graph-tooltip').style('opacity', 0);
    });

  // Add labels for categories (depth 1)
  svg.selectAll('text')
    .data(root.descendants().filter(d => d.depth === 1))
    .enter()
    .append('text')
    .attr('class', 'sunburst-label')
    .attr('transform', d => {
      const angle = (d.x0 + d.x1) / 2;
      const r = (d.y0 + d.y1) / 2;
      const x = Math.sin(angle) * r;
      const y = -Math.cos(angle) * r;
      const rotation = (angle * 180 / Math.PI) - 90;
      return `translate(${x}, ${y}) rotate(${rotation > 90 ? rotation + 180 : rotation})`;
    })
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .text(d => d.data.name.charAt(0).toUpperCase() + d.data.name.slice(1))
    .style('fill', colors.text);

  // Center text
  svg.append('text')
    .attr('class', 'sunburst-center-text')
    .attr('dy', '0.35em')
    .text(data.nodes.length + ' notes')
    .style('fill', colors.text);
}

// Attach toggle button listeners
function attachToggleListeners() {
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });
}

// Modify the existing init code to:
// 1. Cache data after fetching
// 2. Initialize views based on localStorage
// 3. Attach toggle listeners
```

---

### 5. CSS Variables for Graph Colors (add to `_defaults.scss` in both theme mixins)

```scss
// In @mixin theme-light
--graph-books: #10b981;
--graph-topics: #8b5cf6;
--graph-inbox: #f59e0b;
--graph-books-rgb: 16, 185, 129;
--graph-topics-rgb: 139, 92, 246;
--graph-inbox-rgb: 245, 158, 11;

// In @mixin theme-dark (same values work, or adjust for dark mode)
--graph-books: #34d399;
--graph-topics: #a78bfa;
--graph-inbox: #fbbf24;
--graph-books-rgb: 52, 211, 153;
--graph-topics-rgb: 167, 139, 250;
--graph-inbox-rgb: 251, 191, 36;
```

---

## Testing Checklist

- [ ] Toggle bar appears centered above visualization
- [ ] Clicking each toggle switches the view
- [ ] Graph view renders correctly (existing functionality)
- [ ] Grid view shows all nodes as cards with correct styling
- [ ] Sunburst view renders hierarchy with correct colors
- [ ] Clicking cards/arcs navigates to the page
- [ ] View preference persists on page reload (localStorage)
- [ ] Theme toggle works with all three views
- [ ] Mobile responsive (single column grid, smaller sunburst)

---

## Files to Modify

1. `themes/hugo-book/layouts/shortcodes/graph.html` — add toggle bar HTML
2. `themes/hugo-book/assets/_custom.scss` — add toggle bar + grid styles
3. `themes/hugo-book/assets/scss/_graph.scss` — add sunburst styles
4. `themes/hugo-book/assets/js/graph.js` — major refactor for multi-view support
5. `themes/hugo-book/assets/_defaults.scss` — add graph color CSS variables
