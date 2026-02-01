# Phase 3: 手机扫码接入 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual ID input with phone camera QR code scanning, add QR label printing for admin.

**Architecture:** Integrate html5-qrcode for camera-based scanning, wrap in src/lib/scanner.js module. Add scan buttons next to all ID input fields. Support continuous scan for queue-based inputs. Create admin.html for QR code generation/printing using qrcode library. Vite multi-page config for admin.html entry.

**Tech Stack:** html5-qrcode (scanning), qrcode (generation), Vite multi-page build

---

### Task 1: Install dependencies and configure Vite multi-page

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`

**Step 1: Install npm packages**

Run: `npm install html5-qrcode qrcode`

**Step 2: Update vite.config.js for multi-page**

```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
```

**Step 3: Verify dev server still works**

Run: `npm run dev` (check no errors, then Ctrl+C)

**Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.js
git commit -m "feat: add html5-qrcode and qrcode deps, configure multi-page build"
```

---

### Task 2: Create scanner module (src/lib/scanner.js)

**Files:**
- Create: `src/lib/scanner.js`
- Create: `src/__tests__/scanner.test.js`

**Step 1: Write the test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the module's public API logic.
// html5-qrcode is an external lib so we test our wrapper's behavior.

describe('scanner module', () => {
  it('exports startScan, startContinuousScan, stopScan', async () => {
    const mod = await import('../lib/scanner.js');
    expect(typeof mod.startScan).toBe('function');
    expect(typeof mod.startContinuousScan).toBe('function');
    expect(typeof mod.stopScan).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/scanner.test.js`
Expected: FAIL — module doesn't exist yet

**Step 3: Implement scanner.js**

```js
import { Html5Qrcode } from 'html5-qrcode';

let scannerInstance = null;
let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.id = 'scan-overlay';
  overlayEl.innerHTML = `
    <div class="scan-container">
      <div class="scan-header">
        <span>扫描二维码</span>
        <button id="scan-close" type="button">关闭</button>
      </div>
      <div id="scan-reader"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  overlayEl.querySelector('#scan-close').addEventListener('click', () => stopScan());
  return overlayEl;
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

/**
 * Single scan: opens camera, resolves with scanned text, then closes.
 * @param {function} onResult - callback(decodedText)
 */
export async function startScan(onResult) {
  await stopScan();
  const overlay = ensureOverlay();
  overlay.classList.add('active');
  scannerInstance = new Html5Qrcode('scan-reader');
  await scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      onResult(decodedText);
      await stopScan();
    },
    () => {} // ignore errors (no QR found yet)
  );
}

/**
 * Continuous scan: keeps camera open, calls onResult for each unique code.
 * Caller must call stopScan() to end.
 * @param {function} onResult - callback(decodedText) for each new code
 * @param {object} [opts]
 * @param {Set} [opts.seen] - set of already-scanned codes to skip
 * @param {function} [opts.onDuplicate] - callback(decodedText) when duplicate detected
 */
export async function startContinuousScan(onResult, opts = {}) {
  await stopScan();
  const overlay = ensureOverlay();
  overlay.classList.add('active');
  const seen = opts.seen || new Set();
  let cooldown = false;
  scannerInstance = new Html5Qrcode('scan-reader');
  await scannerInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      if (cooldown) return;
      if (seen.has(decodedText)) {
        if (opts.onDuplicate) opts.onDuplicate(decodedText);
        cooldown = true;
        setTimeout(() => { cooldown = false; }, 1500);
        return;
      }
      seen.add(decodedText);
      onResult(decodedText);
      // brief cooldown to avoid rapid-fire
      cooldown = true;
      setTimeout(() => { cooldown = false; }, 800);
      // vibrate on success
      if (navigator.vibrate) navigator.vibrate(100);
    },
    () => {}
  );
}

export async function stopScan() {
  if (scannerInstance) {
    try {
      await scannerInstance.stop();
    } catch {
      // already stopped
    }
    scannerInstance.clear();
    scannerInstance = null;
  }
  if (overlayEl) {
    overlayEl.classList.remove('active');
    removeOverlay();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/scanner.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/scanner.js src/__tests__/scanner.test.js
git commit -m "feat: add scanner module wrapping html5-qrcode"
```

---

### Task 3: Add scan overlay CSS and scan button helper

**Files:**
- Modify: `src/styles.css` (append scan overlay + scan button styles)
- Modify: `src/main.js` (add `scanButton()` helper function, add `--sky` CSS variable fix)

**Step 1: Add CSS for scan overlay and scan buttons**

Append to `src/styles.css`:

```css
/* Scan overlay */
#scan-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
  align-items: center;
  justify-content: center;
}
#scan-overlay.active { display: flex; }

.scan-container {
  width: 100%;
  max-width: 400px;
  margin: 0 16px;
}

.scan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1e293b;
  color: #fff;
  border-radius: 16px 16px 0 0;
  font-weight: 600;
}
.scan-header button {
  background: transparent;
  color: #fff;
  padding: 4px 12px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 8px;
  font-size: 13px;
  min-height: 32px;
}

#scan-reader {
  background: #000;
  border-radius: 0 0 16px 16px;
  overflow: hidden;
}

/* Scan button next to inputs */
.input-with-scan {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: start;
}
.input-with-scan input { width: 100%; }

.scan-btn {
  padding: 10px 12px;
  background: #f8fafc;
  color: var(--primary-600);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 13px;
  min-height: 44px;
  white-space: nowrap;
}
.scan-btn:hover { background: var(--primary-soft); }
```

**Step 2: Add scanButton helper and scanInput helper to main.js**

Add near the top of main.js (after imports), a helper that creates an input with a scan button:

```js
import { startScan, startContinuousScan, stopScan } from './lib/scanner.js';

// Helper: returns HTML for input + scan button
function scanInput(id, placeholder, label) {
  return `<div class="input-with-scan">
    <input id="${id}" placeholder="${placeholder}" />
    <button type="button" class="scan-btn" data-scan-target="${id}">扫码</button>
  </div>`;
}
```

Also fix the missing `--sky` variable: in styles.css `:root`, add `--sky: #0ea5e9;` (same as --primary).

**Step 3: Verify dev server still works**

Run: `npm run dev` (check no errors, then Ctrl+C)

**Step 4: Commit**

```bash
git add src/styles.css src/main.js
git commit -m "feat: add scan overlay CSS and scanInput helper"
```

---

### Task 4: Wire scan buttons to all single-scan input fields

**Files:**
- Modify: `src/main.js`

This task replaces all relevant `<input>` fields in the render functions with the `scanInput()` helper, and wires up scan buttons to call `startScan()`.

**Inputs to add scan buttons to (single scan):**

| Tab | Input ID | Purpose |
|-----|----------|---------|
| split/create | `#create-tray` | Create mode tray |
| split/split | `#parent-dish` | Split parent dish |
| split/split | `#split-tray` | Split tray |
| split/merge | `#merge-tray` | Merge tray |
| split/merge | `#merge-target` | Merge target dish |
| place | `#place-location` | Placement location |
| status | `#status-dish` | Status dish |
| transfer | `#old-dish` | Transfer old dish |
| transfer | `#new-dish` | Transfer new dish |

**Step 1: Update renderSplitTab()**

Replace the plain `<input>` elements for `create-tray`, `parent-dish`, `split-tray`, `merge-tray`, `merge-target` with `scanInput()`. For each section, add a `wireScanButtons()` call.

Add a global `wireScanButtons` function:

```js
function wireScanButtons(root) {
  root.querySelectorAll('.scan-btn[data-scan-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.scanTarget;
      const input = root.querySelector(`#${targetId}`);
      startScan((text) => {
        if (input) input.value = text;
        input?.focus();
        // auto-click trigger button if exists
        const trigger = btn.dataset.scanTrigger;
        if (trigger) root.querySelector(`#${trigger}`)?.click();
      });
    });
  });
}
```

In each render function, call `wireScanButtons(content)` after `wireHelpers(content)`.

**Step 2: Update renderPlaceTab()**

Replace `#place-location` input with scanInput. The `#place-tray` input also gets a scan button (but this one will be wired for continuous scan in Task 5).

**Step 3: Update renderStatusTab()**

Replace `#status-dish` with scanInput.

**Step 4: Update renderTransferTab()**

Replace `#old-dish` and `#new-dish` with scanInput.

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All existing tests pass (frontend tests don't render DOM)

**Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: add scan buttons to all ID input fields"
```

---

### Task 5: Add continuous scan for queue-based inputs

**Files:**
- Modify: `src/main.js`

**Queue-based inputs that need continuous scan:**

| Tab | Input | Queue | Purpose |
|-----|-------|-------|---------|
| split/merge | `#merge-parent-input` | parentQueue | Merge parent dishes |
| place | `#place-tray` | trayList | Batch placement trays |

**Step 1: Update merge parent input for continuous scan**

Replace the merge parent input scan button with a "连续扫码" button. When clicked, starts `startContinuousScan()` that auto-adds to the parent queue. The overlay stays open. Each scan calls `addParent(text)`. Duplicate detection uses the parentQueue array.

Add a scan button with `data-scan-mode="continuous"` attribute:

```html
<button type="button" class="scan-btn" data-scan-mode="continuous" id="merge-parent-scan">连扫</button>
```

Wire it:

```js
const mergeParentScan = content.querySelector('#merge-parent-scan');
if (mergeParentScan) {
  mergeParentScan.addEventListener('click', () => {
    const seen = new Set(parentQueue);
    startContinuousScan(
      (text) => { addParent(text); },
      { seen, onDuplicate: (text) => toast(`${text} 已在队列`, 'error') }
    );
  });
}
```

**Step 2: Update batch placement tray input for continuous scan**

Same pattern for `#place-tray` — add a "连扫" button next to the existing "添加" button. When clicked, starts continuous scan that adds trays to trayList.

```js
const trayScan = content.querySelector('#place-tray-scan');
if (trayScan) {
  trayScan.addEventListener('click', () => {
    const seen = new Set(trayList);
    startContinuousScan(
      (text) => {
        if (trayList.includes(text)) {
          toast('已在队列中', 'error');
          return;
        }
        trayList.push(text);
        renderTrayQueue();
      },
      { seen, onDuplicate: (text) => toast(`${text} 已在队列`, 'error') }
    );
  });
}
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: add continuous scan for merge parent and batch placement queues"
```

---

### Task 6: Create admin.html for QR code generation and printing

**Files:**
- Create: `admin.html`
- Create: `src/admin.js`
- Modify: `index.html` (add link to admin page in header)

**Step 1: Create admin.html**

```html
<!DOCTYPE html>
<html lang="zh-Hans">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>标签打印 · 花苗流程</title>
  <meta name="theme-color" content="#0ea5e9" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./src/styles.css" />
</head>
<body>
  <div id="app">
    <header class="app-header">
      <div>
        <div class="title">标签打印</div>
        <div class="subtitle">生成二维码 · 打印标签</div>
      </div>
      <div class="header-actions">
        <a href="./index.html" class="link">返回主页</a>
      </div>
    </header>
    <main id="admin-content">
      <section class="card">
        <div class="card-title">生成二维码标签</div>
        <div class="small">输入前缀和范围，批量生成可打印的二维码标签</div>
      </section>
      <section class="card">
        <label>类型</label>
        <select id="qr-type">
          <option value="dish">培养皿 (D-)</option>
          <option value="tray">盘子 (T-)</option>
          <option value="location">位置 (rack-)</option>
          <option value="custom">自定义前缀</option>
        </select>
      </section>
      <section class="card" id="custom-prefix-panel" style="display:none">
        <label>自定义前缀</label>
        <input id="qr-prefix" placeholder="如 MY-" />
      </section>
      <section class="card">
        <label>起始编号</label>
        <input id="qr-start" type="number" min="1" value="1" />
        <label style="margin-top:8px">数量</label>
        <input id="qr-count" type="number" min="1" max="200" value="20" />
      </section>
      <div class="action-row">
        <button id="qr-generate" class="primary-action">生成标签</button>
      </div>
      <div class="action-row" id="print-row" style="display:none;margin-top:8px">
        <button id="qr-print" class="primary-action" style="background:var(--success)">打印标签</button>
      </div>
      <section id="qr-grid" class="qr-grid"></section>
    </main>
  </div>
  <script type="module" src="./src/admin.js"></script>
</body>
</html>
```

**Step 2: Create src/admin.js**

```js
import QRCode from 'qrcode';

const typeSelect = document.getElementById('qr-type');
const customPanel = document.getElementById('custom-prefix-panel');
const prefixInput = document.getElementById('qr-prefix');
const startInput = document.getElementById('qr-start');
const countInput = document.getElementById('qr-count');
const generateBtn = document.getElementById('qr-generate');
const printRow = document.getElementById('print-row');
const printBtn = document.getElementById('qr-print');
const grid = document.getElementById('qr-grid');

const prefixMap = { dish: 'D-', tray: 'T-', location: 'rack-' };

typeSelect.addEventListener('change', () => {
  customPanel.style.display = typeSelect.value === 'custom' ? 'block' : 'none';
});

generateBtn.addEventListener('click', async () => {
  const type = typeSelect.value;
  const prefix = type === 'custom' ? (prefixInput.value || 'X-') : prefixMap[type];
  const start = Math.max(1, Number(startInput.value) || 1);
  const count = Math.min(200, Math.max(1, Number(countInput.value) || 20));

  grid.innerHTML = '';
  printRow.style.display = 'none';

  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(`${prefix}${start + i}`);
  }

  for (const id of ids) {
    const cell = document.createElement('div');
    cell.className = 'qr-cell';
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, id, { width: 120, margin: 1 });
    cell.appendChild(canvas);
    const label = document.createElement('div');
    label.className = 'qr-label';
    label.textContent = id;
    cell.appendChild(label);
    grid.appendChild(cell);
  }

  printRow.style.display = 'flex';
});

printBtn.addEventListener('click', () => {
  window.print();
});
```

**Step 3: Add print-specific CSS and QR grid styles**

Append to `src/styles.css`:

```css
/* QR label grid */
.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.qr-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}

.qr-cell canvas { width: 120px; height: 120px; }

.qr-label {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

/* Print styles */
@media print {
  body { background: #fff !important; }
  .app-header, .card:not(.qr-grid), .action-row, select, input, label, .small { display: none !important; }
  #admin-content > .card { display: none !important; }
  .qr-grid {
    display: grid !important;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin: 0;
  }
  .qr-cell { border: 1px dashed #ccc; break-inside: avoid; }
}
```

**Step 4: Add admin link to index.html header**

In `index.html`, add a link to admin page in the header-actions div:

```html
<a id="admin-link" href="./admin.html" class="link" style="font-size:12px">标签打印</a>
```

**Step 5: Verify everything builds**

Run: `npm run build`
Expected: Build succeeds with 3 entry points (index.html, login.html, admin.html)

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add admin.html src/admin.js src/styles.css index.html
git commit -m "feat: add admin page for QR code label generation and printing"
```

---

## Summary of changes across tasks

| Task | What | Files |
|------|------|-------|
| 1 | Install deps + Vite multi-page | package.json, vite.config.js |
| 2 | Scanner module | src/lib/scanner.js, test |
| 3 | Scan overlay CSS + helper | src/styles.css, src/main.js |
| 4 | Wire single-scan to all inputs | src/main.js |
| 5 | Continuous scan for queues | src/main.js |
| 6 | Admin QR generation page | admin.html, src/admin.js, styles, index.html |
