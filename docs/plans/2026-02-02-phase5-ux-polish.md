# Phase 5: 前端体验打磨 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the frontend UX for real-world usage: offline detection, event log enhancements, and responsive layout for wider screens.

**Architecture:** All changes are frontend-only (src/main.js, src/styles.css, index.html). No server changes. Offline detection uses `navigator.onLine` + fetch error handling. Event details use CSS-only expand/collapse via hidden content toggled by click. My history gets a type filter dropdown matching the event log filter.

**Tech Stack:** Vanilla JS, CSS

**YAGNI decisions:**
- Event log time range filter: Skipped — complex date picker UI for a POC adds too much complexity. The existing type filter is sufficient.
- Vibrate on scan: Already implemented in scanner.js `startContinuousScan`.
- Submit loading states: Already implemented via `withSubmit()`.

---

### Task 1: Add offline detection banner and auto-reconnect

**Files:**
- Modify: `index.html` — add offline banner element
- Modify: `src/main.js` — add online/offline event listeners, disable submits when offline
- Modify: `src/styles.css` — add offline banner styles

**Step 1: Add offline banner to index.html**

Add this right after the opening `<div id="app">` tag, before the header:

```html
    <div id="offline-banner" class="offline-banner" style="display:none">离线中 · 请检查网络连接</div>
```

**Step 2: Add offline banner CSS to styles.css**

Append to `src/styles.css`:

```css
/* Offline banner */
.offline-banner {
  background: var(--danger);
  color: #fff;
  text-align: center;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 12px;
  margin-bottom: 8px;
}
```

**Step 3: Add offline detection logic to main.js**

Add after the DOM element declarations (around line 36, after `const logoutBtn = ...`):

```js
const offlineBanner = document.getElementById('offline-banner');

function setOffline(isOffline) {
  if (offlineBanner) offlineBanner.style.display = isOffline ? 'block' : 'none';
}

window.addEventListener('online', async () => {
  setOffline(false);
  try {
    await loadState();
    switchTab(activeTab);
    renderEventLog();
    renderMyHistory();
  } catch (err) {
    if (!handleAuthError(err)) toast('重新加载失败', 'error');
  }
});

window.addEventListener('offline', () => {
  setOffline(true);
});
```

Also update `withSubmit` to check online status before submitting. Change:

```js
async function withSubmit(btn, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '提交中...';
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
```

to:

```js
async function withSubmit(btn, fn) {
  if (!navigator.onLine) {
    toast('当前离线，无法提交', 'error');
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '提交中...';
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All 68 tests pass

**Step 5: Commit**

```bash
git add index.html src/main.js src/styles.css
git commit -m "feat: add offline detection banner and auto-reconnect"
```

---

### Task 2: Add type filter to "我的历史" section

**Files:**
- Modify: `index.html` — add filter dropdown to my-history card header
- Modify: `src/main.js` — wire my-history filter, update renderMyHistory

**Step 1: Add filter dropdown to my-history in index.html**

In `index.html`, find the my-history section. The current card-header has no filter. Change:

```html
    <section id="my-history" class="card">
      <div class="card-header">
        <div>
          <div class="card-title">我的录入历史</div>
          <div class="card-sub">仅本人 · 最近20条</div>
        </div>
      </div>
      <ul id="my-event-list" class="event-list"></ul>
    </section>
```

to:

```html
    <section id="my-history" class="card">
      <div class="card-header">
        <div>
          <div class="card-title">我的录入历史</div>
          <div class="card-sub">仅本人 · 最近20条</div>
        </div>
        <select id="filter-my-type">
          <option value="all">全部</option>
          <option value="create">创建</option>
          <option value="split">拆分</option>
          <option value="merge">合并</option>
          <option value="place">上架</option>
          <option value="status">状态</option>
          <option value="transfer">转移</option>
          <option value="undo">撤销</option>
        </select>
      </div>
      <ul id="my-event-list" class="event-list"></ul>
    </section>
```

**Step 2: Wire filter in main.js**

Add after the filterType declaration (around line 33):

```js
const filterMyType = document.getElementById('filter-my-type');
```

Update `renderMyHistory` to respect the filter:

```js
function renderMyHistory() {
  if (!myEventList) return;
  const type = filterMyType?.value || 'all';
  const filtered = state.myEvents.filter((e) => type === 'all' || e.type === type);
  const events = filtered.slice(0, 20);
  if (events.length === 0) {
    myEventList.innerHTML = '<li class="event-item empty">暂无记录</li>';
    return;
  }
  myEventList.innerHTML = events
    .map((e) => {
      const inText = e.inputIds.length ? e.inputIds.join(', ') : '-';
      const outText = e.outputIds.length ? e.outputIds.join(', ') : '-';
      const meta = metaText(e);
      return `<li class="event-item">
          <div class="event-title">${labelOfType(e.type)} · ${new Date(e.ts).toLocaleTimeString()}</div>
          <div class="event-meta">in: ${inText} | out: ${outText}</div>
          ${meta ? `<div class="event-meta">${meta}</div>` : ''}
        </li>`;
    })
    .join('');
}
```

Add the change listener after the existing `filterType.addEventListener('change', renderEventLog);`:

```js
if (filterMyType) filterMyType.addEventListener('change', renderMyHistory);
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All 68 tests pass

**Step 4: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: add type filter to my history section"
```

---

### Task 3: Add click-to-expand event details

**Files:**
- Modify: `src/main.js` — update renderEventLog and renderMyHistory to include expandable details
- Modify: `src/styles.css` — add expand/collapse styles

**Step 1: Add CSS for expandable event items**

Append to `src/styles.css`:

```css
/* Expandable event details */
.event-item { cursor: pointer; }
.event-detail {
  display: none;
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 12px;
  color: var(--sub);
  word-break: break-all;
}
.event-item.expanded .event-detail { display: block; }
```

**Step 2: Update event rendering in main.js**

Create a shared helper function for rendering event items (used by both renderEventLog and renderMyHistory):

```js
function renderEventItem(e) {
  const inText = e.inputIds.length ? e.inputIds.join(', ') : '-';
  const outText = e.outputIds.length ? e.outputIds.join(', ') : '-';
  const meta = metaText(e);
  const detailParts = [];
  detailParts.push(`ID: ${e.id}`);
  detailParts.push(`操作人: ${e.actorId}`);
  if (Object.keys(e.meta || {}).length > 0) {
    detailParts.push(`详情: ${JSON.stringify(e.meta)}`);
  }
  return `<li class="event-item" data-event-id="${e.id}">
    <div class="event-title">${labelOfType(e.type)} · ${new Date(e.ts).toLocaleTimeString()}</div>
    <div class="event-meta">in: ${inText} | out: ${outText}</div>
    ${meta ? `<div class="event-meta">${meta}</div>` : ''}
    <div class="event-detail">${detailParts.join('<br>')}</div>
  </li>`;
}
```

Update `renderEventLog` to use the helper and wire click handlers:

```js
function renderEventLog() {
  const type = filterType.value;
  const events = state.events.filter((e) => type === 'all' || e.type === type);
  eventList.innerHTML = events.map(renderEventItem).join('');
  wireEventExpand(eventList);
}
```

Update `renderMyHistory` to use the helper too:

```js
function renderMyHistory() {
  if (!myEventList) return;
  const type = filterMyType?.value || 'all';
  const filtered = state.myEvents.filter((e) => type === 'all' || e.type === type);
  const events = filtered.slice(0, 20);
  if (events.length === 0) {
    myEventList.innerHTML = '<li class="event-item empty">暂无记录</li>';
    return;
  }
  myEventList.innerHTML = events.map(renderEventItem).join('');
  wireEventExpand(myEventList);
}
```

Add the wire function:

```js
function wireEventExpand(list) {
  list.querySelectorAll('.event-item:not(.empty)').forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
  });
}
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All 68 tests pass

**Step 4: Commit**

```bash
git add src/main.js src/styles.css
git commit -m "feat: add click-to-expand event details"
```

---

### Task 4: Responsive layout for wider screens

**Files:**
- Modify: `src/styles.css` — add media query for tablet/desktop widths

**Step 1: Add responsive CSS**

Append to `src/styles.css`:

```css
/* Wider screens (tablet/desktop) */
@media (min-width: 768px) {
  #app {
    max-width: 720px;
    padding: 24px 20px 104px;
  }
  .tab-bar {
    max-width: 720px;
  }
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .card {
    padding: 20px;
  }
  .app-header {
    padding: 14px 20px;
  }
}
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All 68 tests pass

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add responsive layout for wider screens"
```

---

## Summary of changes across tasks

| Task | What | Files |
|------|------|-------|
| 1 | Offline detection banner + auto-reconnect | index.html, main.js, styles.css |
| 2 | My history type filter | index.html, main.js |
| 3 | Click-to-expand event details | main.js, styles.css |
| 4 | Responsive layout for wider screens | styles.css |
