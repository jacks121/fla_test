# Flower Seedling POC SPA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-page mobile-friendly web POC (mock data + mock QR) that demonstrates four flows: 拆分/合并、批量上架、状态更新、换皿转移。 No real hardware; mock scan via text/selection. 

**Architecture:** Static SPA using HTML + CSS + ES modules. In-memory store for plants/dishes/events with mock seeds. UI uses bottom tabs for four modes; scan simulator input drives event handlers. Event log view for demo.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), simple local state; Vitest for unit tests of pure domain logic; npm scripts for test/serve (optional simple dev server via `npm run dev` using `vite` for convenience).

---

### Task 1: Initialize project scaffolding

**Files:**
- Create: `package.json`, `index.html`, `src/main.js`, `src/styles.css`, `src/lib/domain.js`, `src/lib/mockData.js`
- Create: `vite.config.js` (lightweight), `.gitignore`

**Step 1: Initialize npm**
- Run: `npm init -y`

**Step 2: Add dev deps**
- Run: `npm install --save-dev vite vitest`

**Step 3: Add scripts**
- Edit `package.json` scripts: `dev`, `build`, `preview`, `test`

**Step 4: Add .gitignore**
- Include: `node_modules`, `dist`

**Step 5: Base HTML shell**
- Create `index.html` with mobile viewport, link to `src/styles.css`, module script `src/main.js`, bottom tab container, main content slot.

### Task 2: Domain model + mock data (pure, testable)

**Files:** `src/lib/domain.js`, `src/lib/mockData.js`, `src/lib/domain.test.js`

**Step 1: Define data shapes**
- plant: { id, type, stage, status, dishId }
- dish: { id, plantId }
- location: { id, label }
- event: { id, type, actor, ts, inputIds, outputIds, meta }

**Step 2: Implement operations**
- `split({ parentId, children })` -> new dishes/plants, events
- `merge({ parentIds, outputs })`
- `place({ locationId, dishIds })`
- `updateStatus({ dishId, status })`
- `transfer({ fromDishId, toDishId })`
- `undoLast(n=1)` basic pop for POC

**Step 3: Mock seeds**
- 10 plants/dishes, 3 locations, sample staff list

**Step 4: Unit tests (vitest)**
- Cover split, place, transfer, status, undo
- Run: `npm run test`

### Task 3: UI layout & navigation

**Files:** `src/styles.css`, `src/main.js`

**Step 1: Styles**
- Mobile-first flex layout, sticky bottom tab bar, cards for forms/log

**Step 2: Tabs**
- Four tabs: 拆分/合并, 上架, 状态, 转移
- Tab switching updates visible panel and highlights active tab

### Task 4: Scan simulator & flows

**Files:** `src/main.js`

**Step 1: Scan simulator input**
- Text input + preset mock buttons (quick insert IDs)

**Step 2: Implement panels**
- 拆分/合并：父 dish 输入/选择，子数量与生成按钮，输出事件
- 上架：先选位置，再连续“扫描”皿ID列表
- 状态：扫皿ID + 状态选择 +提交
- 转移：扫旧皿 + 新皿，提交

**Step 3: Live feedback**
- Toast/inline提示：成功、重复、顺序错误
- Undo 最近一步按钮

### Task 5: Event log & demo data view

**Files:** `src/main.js`, `src/styles.css`

**Step 1:** Event list (latest first) with type, actors, ids
**Step 2:** Simple filters (by type optional) if time allows

### Task 6: Manual QA & polish

**Step 1:** Run `npm run dev` and walk demo script: 拆分→上架→状态→转移
**Step 2:** Adjust copy/labels for 1h onboarding target
**Step 3:** Update docs if needed

### Task 7: Commit

**Step 1:** `git status`
**Step 2:** `git add .`
**Step 3:** `git commit -m "feat: add POC single-page mock app"`

---

Plan complete and saved to `docs/plans/2026-01-31-flower-seedling-automation-poc-impl.md`. Two execution options:
1) Subagent-driven in this session (recommended)
2) Parallel session with executing-plans
