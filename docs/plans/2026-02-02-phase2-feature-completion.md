# Phase 2: Feature Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add create/intake flow, undo functionality, batch placement UX, and input validation to make the app usable for real workflows.

**Architecture:** Backend-first for new event types (create, undo), then wire frontend. Undo reverses side effects inside a transaction and inserts an undo event. Batch placement is frontend-only (sends multiple place events). All changes preserve existing API contracts.

**Tech Stack:** Express + better-sqlite3 (server), vanilla JS (client), vitest + supertest (tests).

---

### Task 1: Add `create` event type (backend)

**Files:**
- Modify: `server/domain.js`
- Modify: `server/app.js`
- Modify: `server/__tests__/domain.test.js`
- Modify: `server/__tests__/events.test.js`

**Step 1: Write failing tests for domain.create**

Append to `server/__tests__/domain.test.js`, before the `event persistence` describe block:

```js
describe('domain.create', () => {
  it('creates plants and dishes in batch', () => {
    const { db, domain } = setup();
    const event = domain.create({ type: '品种A', stage: '萌发', count: 3, trayId: 'T-01' });
    expect(event.type).toBe('create');
    expect(event.outputIds).toHaveLength(3);
    expect(event.meta.plantType).toBe('品种A');
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(13); // 10 seed + 3 new
  });

  it('rejects missing type', () => {
    const { domain } = setup();
    expect(() => domain.create({ stage: '萌发', count: 1, trayId: 'T-01' }))
      .toThrow('缺少品种');
  });

  it('rejects count < 1', () => {
    const { domain } = setup();
    expect(() => domain.create({ type: '品种A', stage: '萌发', count: 0, trayId: 'T-01' }))
      .toThrow('数量需大于 0');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: FAIL — `domain.create is not a function`

**Step 3: Implement create in domain.js**

In `server/domain.js`, add the `create` function inside `createDomain()`, after `transfer` and before the `return` statement:

```js
  const create = db.transaction(({ type, stage, count, trayId, actorId = 'emp-01' }) => {
    if (!type) throw new Error('缺少品种');
    if (!stage) throw new Error('缺少阶段');
    if (!count || count < 1) throw new Error('数量需大于 0');
    if (!trayId) throw new Error('缺少盘子编号');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = nextPlantId();
      const dishId = nextDishId();
      stmts.insertPlant.run(plantId, type, stage, '正常', dishId);
      stmts.insertDish.run(dishId, plantId);
      outputIds.push(plantId);
    }

    return createEvent({
      type: 'create', actorId,
      inputIds: [], outputIds,
      meta: { plantType: type, stage, count, trayId },
    });
  });
```

Update the return statement:

```js
  return { create, split, merge, place, updateStatus, transfer };
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: PASS

**Step 5: Add `case 'create'` in app.js**

In `server/app.js`, add inside the `switch (type)` block in `POST /api/events`, before `case 'split'`:

```js
        case 'create':
          event = domain.create({ ...payload, actorId: actor });
          break;
```

**Step 6: Write integration test for create**

Append to `server/__tests__/events.test.js`, inside the `POST /api/events` describe block:

```js
  it('records create event', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'create',
        actorId: 'emp-01',
        payload: { type: '品种A', stage: '萌发', count: 2, trayId: 'T-01' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('create');
    expect(res.body.outputIds.length).toBe(2);
    expect(res.body.meta.plantType).toBe('品种A');
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(12);
  });
```

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add server/domain.js server/app.js server/__tests__/domain.test.js server/__tests__/events.test.js
git commit -m "feat: add create event type for plant intake"
```

---

### Task 2: Add `undo` function + endpoint (backend)

**Files:**
- Modify: `server/domain.js` (add undo, modify updateStatus, add stmts/import)
- Modify: `server/app.js` (add POST /api/events/undo)
- Modify: `server/__tests__/domain.test.js`
- Modify: `server/__tests__/events.test.js`

**Step 1: Write failing tests for undo**

Append to `server/__tests__/domain.test.js`:

```js
describe('domain.undo', () => {
  it('undoes a split by deleting created plants/dishes', () => {
    const { db, domain } = setup();
    const splitEvent = domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 2, actorId: 'user-1' });
    const undoEvent = domain.undo({ actorId: 'user-1' });
    expect(undoEvent.type).toBe('undo');
    expect(undoEvent.meta.undoneEventId).toBe(splitEvent.id);
    expect(undoEvent.meta.undoneEventType).toBe('split');
    // The 2 created plants should be deleted
    for (const pid of splitEvent.outputIds) {
      expect(db.prepare('SELECT * FROM plants WHERE id = ?').get(pid)).toBeUndefined();
    }
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10); // back to seed count
  });

  it('undoes a create by deleting created plants/dishes', () => {
    const { db, domain } = setup();
    domain.create({ type: '品种A', stage: '萌发', count: 2, trayId: 'T-01', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10);
  });

  it('undoes a merge by deleting merged plant/dish', () => {
    const { db, domain } = setup();
    domain.merge({ parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10);
  });

  it('undoes a status change by restoring old status', () => {
    const { db, domain } = setup();
    domain.updateStatus({ dishId: 'D-1', status: '感染', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('正常');
  });

  it('undoes a transfer by restoring old dish', () => {
    const { db, domain } = setup();
    domain.transfer({ fromDishId: 'D-1', toDishId: 'D-X1', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeTruthy();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-X1')).toBeUndefined();
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant.dishId).toBe('D-1');
  });

  it('rejects consecutive undo', () => {
    const { domain } = setup();
    domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 1, actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    expect(() => domain.undo({ actorId: 'user-1' })).toThrow('不能连续撤销');
  });

  it('rejects undo with no events', () => {
    const { domain } = setup();
    expect(() => domain.undo({ actorId: 'user-1' })).toThrow('没有可撤销的操作');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: FAIL — `domain.undo is not a function`

**Step 3: Modify updateStatus to store oldStatus**

In `server/domain.js`, update the `updateStatus` function. Change:

```js
  const updateStatus = db.transaction(({ dishId, status, actorId = 'emp-01' }) => {
    const dish = stmts.findDishById.get(dishId);
    if (!dish) throw new Error('培养皿不存在');
    const plant = stmts.findPlantById.get(dish.plantId);
    if (!plant) throw new Error('花苗不存在');
    stmts.updatePlantStatus.run(status, plant.id);
    return createEvent({
      type: 'status', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { status },
    });
  });
```

To:

```js
  const updateStatus = db.transaction(({ dishId, status, actorId = 'emp-01' }) => {
    const dish = stmts.findDishById.get(dishId);
    if (!dish) throw new Error('培养皿不存在');
    const plant = stmts.findPlantById.get(dish.plantId);
    if (!plant) throw new Error('花苗不存在');
    const oldStatus = plant.status;
    stmts.updatePlantStatus.run(status, plant.id);
    return createEvent({
      type: 'status', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { status, oldStatus },
    });
  });
```

**Step 4: Add deletePlant statement and parseEvent import**

Add import at the top of `server/domain.js`:

```js
import { parseEvent } from './db.js';
```

Add to the `stmts` object inside `createDomain()`:

```js
    deletePlant: db.prepare('DELETE FROM plants WHERE id = ?'),
```

**Step 5: Implement undo function**

In `server/domain.js`, add after `create` and before the `return` statement:

```js
  const undo = db.transaction(({ actorId }) => {
    if (!actorId) throw new Error('缺少操作人');

    const lastRow = db.prepare(
      'SELECT * FROM events WHERE actorId = ? ORDER BY ts DESC LIMIT 1'
    ).get(actorId);
    if (!lastRow) throw new Error('没有可撤销的操作');

    const last = parseEvent(lastRow);
    if (last.type === 'undo') throw new Error('已撤销最近操作，不能连续撤销');

    const elapsed = Date.now() - new Date(last.ts).getTime();
    if (elapsed > 5 * 60 * 1000) throw new Error('操作已超过 5 分钟，无法撤销');

    switch (last.type) {
      case 'create':
      case 'split':
      case 'merge':
        for (const plantId of last.outputIds) {
          const plant = stmts.findPlantById.get(plantId);
          if (plant) {
            if (plant.dishId) stmts.deleteDish.run(plant.dishId);
            stmts.deletePlant.run(plantId);
          }
        }
        break;
      case 'status':
        if (last.meta.oldStatus && last.inputIds.length > 0) {
          stmts.updatePlantStatus.run(last.meta.oldStatus, last.inputIds[0]);
        }
        break;
      case 'transfer': {
        const { fromDishId, toDishId } = last.meta;
        const plantId = last.inputIds[0];
        if (plantId && fromDishId && toDishId) {
          stmts.deleteDish.run(toDishId);
          stmts.insertDish.run(fromDishId, plantId);
          stmts.updatePlantDishId.run(fromDishId, plantId);
        }
        break;
      }
      case 'place':
        break;
      default:
        throw new Error(`不支持撤销 ${last.type} 类型`);
    }

    return createEvent({
      type: 'undo', actorId,
      inputIds: [], outputIds: [],
      meta: { undoneEventId: last.id, undoneEventType: last.type },
    });
  });
```

Update the return statement:

```js
  return { create, split, merge, place, updateStatus, transfer, undo };
```

**Step 6: Run domain tests**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: PASS

**Step 7: Add POST /api/events/undo route**

In `server/app.js`, add this route BEFORE `app.post('/api/events', ...)`:

```js
  app.post('/api/events/undo', (req, res) => {
    try {
      const actorId = req.user?.id || 'emp-01';
      const event = domain.undo({ actorId });
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });
```

**Step 8: Write integration test for undo endpoint**

Append to `server/__tests__/events.test.js`:

```js
describe('POST /api/events/undo', () => {
  it('undoes the most recent event', async () => {
    const { db, app, token } = await setupWithToken();
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'split',
        payload: { parentDishId: 'D-1', trayId: 'T-01', count: 2 },
      });
    const dishesAfterSplit = db.prepare('SELECT * FROM dishes').all();
    expect(dishesAfterSplit.length).toBe(12);

    const res = await request(app)
      .post('/api/events/undo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('undo');
    expect(res.body.meta.undoneEventType).toBe('split');
    const dishesAfterUndo = db.prepare('SELECT * FROM dishes').all();
    expect(dishesAfterUndo.length).toBe(10);
  });

  it('rejects when no events to undo', async () => {
    const { app } = setup();
    const login = await request(app).post('/api/login').send({ username: 'newuser', password: 'pass' });
    const res = await request(app)
      .post('/api/events/undo')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('没有可撤销的操作');
  });
});
```

**Step 9: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 10: Commit**

```bash
git add server/domain.js server/app.js server/__tests__/domain.test.js server/__tests__/events.test.js
git commit -m "feat: add undo function with 5-min window and side-effect reversal"
```

---

### Task 3: Add "创建" mode to split tab + update event display (frontend)

**Files:**
- Modify: `src/main.js` (renderSplitTab, labelOfType, metaText)

**Step 1: Update labelOfType**

In `src/main.js`, replace the `labelOfType` function:

```js
function labelOfType(t) {
  return {
    create: '创建',
    split: '拆分',
    merge: '合并',
    place: '上架',
    status: '状态',
    transfer: '转移',
    undo: '撤销',
  }[t] || t;
}
```

**Step 2: Update metaText for create and undo events**

Replace the `metaText` function:

```js
function metaText(e) {
  const parts = [];
  if (e.meta?.trayId) parts.push(`盘子: ${e.meta.trayId}`);
  if (e.type === 'create' && e.meta?.plantType) parts.push(`品种: ${e.meta.plantType}`);
  if (e.type === 'create' && e.meta?.stage) parts.push(`阶段: ${e.meta.stage}`);
  if (e.type === 'place' && e.meta?.locationId) parts.push(`位置: ${e.meta.locationId}`);
  if (e.type === 'status') parts.push(`状态: ${e.meta.status}`);
  if (e.type === 'transfer') parts.push(`从 ${e.meta.fromDishId} 到 ${e.meta.toDishId}`);
  if (e.type === 'undo') parts.push(`撤销: ${labelOfType(e.meta?.undoneEventType)}`);
  return parts.join(' · ');
}
```

**Step 3: Add "创建" mode to renderSplitTab**

Replace the entire `renderSplitTab()` function with:

```js
function renderSplitTab() {
  const typeOptions = (state.meta.types || ['品种A', '品种B'])
    .map((t) => `<option value="${t}">${t}</option>`)
    .join('');
  const stageOptions = (state.meta.stages || ['萌发', '生长', '分化'])
    .map((s) => `<option value="${s}">${s}</option>`)
    .join('');

  content.innerHTML = `
    <section class="card">
      <div class="card-title">创建/拆分/合并</div>
      <div class="small">创建：品种+阶段+数量；拆分：父皿+盘号+数量；合并：盘号+多父皿。</div>
    </section>
    <section class="card">
      <label>模式</label>
      <select id="split-mode">
        <option value="create">创建（入库）</option>
        <option value="split">拆分</option>
        <option value="merge">合并</option>
      </select>
    </section>

    <section class="panel card" id="create-type-panel">
      <label>品种</label>
      <select id="create-type">${typeOptions}</select>
    </section>
    <section class="panel card" id="create-stage-panel">
      <label>阶段</label>
      <select id="create-stage">${stageOptions}</select>
    </section>
    <section class="panel card" id="create-count-panel">
      <label>数量</label>
      <input id="create-count" type="number" min="1" value="3" />
    </section>
    <section class="panel card" id="create-tray-panel">
      <label>盘子编号</label>
      <input id="create-tray" placeholder="如 T-01" />
      ${helperRow(trayIds(), 'create-tray')}
    </section>

    <section class="panel card" id="split-parent-panel">
      <label for="parent-dish">父培养皿 ID（仅拆分模式，单个）</label>
      <input id="parent-dish" placeholder="如 D-1 或扫码填入" />
      ${helperRow(dishIds().slice(0, 5), 'parent-dish')}
    </section>
    <section class="panel card" id="split-tray-panel">
      <label>盘子编号（拆分结果所在盘）</label>
      <input id="split-tray" placeholder="如 T-01" />
      ${helperRow(trayIds(), 'split-tray')}
    </section>
    <section class="panel card" id="split-count-panel">
      <label>拆分数量</label>
      <input id="split-count" type="number" min="1" value="3" />
    </section>

    <section class="panel card" id="merge-tray-panel">
      <label>合并后盘子编号</label>
      <div class="form-grid">
        <input id="merge-tray" placeholder="如 T-02" />
        <button id="merge-tray-fill" type="button">生成盘号</button>
      </div>
      ${helperRow(trayIds(), 'merge-tray')}
    </section>
    <section class="panel card" id="merge-target-panel">
      <label>新培养皿编号（可选，不填则自动生成）</label>
      <div class="form-grid">
        <input id="merge-target" placeholder="如 ND-101" />
        <button id="merge-target-fill" type="button">生成新皿</button>
      </div>
      ${helperRow(newDishHints, 'merge-target')}
    </section>
    <section class="panel card" id="merge-parent-panel">
      <label>父培养皿（多个，逐一扫码加入队列）</label>
      <div class="form-grid">
        <input id="merge-parent-input" placeholder="扫描/输入父皿ID，回车加入" />
        <button id="merge-parent-add" type="button">加入队列</button>
      </div>
      <input id="merge-parent-bulk" placeholder="或直接粘贴逗号分隔列表" />
      ${helperRow(dishIds().slice(0, 5), 'merge-parent-input', 'merge-parent-add')}
      <button id="merge-parent-clear" type="button" class="ghost" style="margin-top:6px;width:100%;">清空队列</button>
      <div id="merge-parent-queue" class="chip-row"></div>
    </section>

    <div class="action-row">
      <button id="split-submit" class="primary-action">提交</button>
    </div>
  `;
  wireHelpers(content);

  const modeSel = content.querySelector('#split-mode');
  const splitParentPanel = content.querySelector('#split-parent-panel');
  const parentInput = content.querySelector('#parent-dish');
  const submit = content.querySelector('#split-submit');
  const splitTrayInput = content.querySelector('#split-tray');
  const splitCountInput = content.querySelector('#split-count');
  const splitPanel = content.querySelector('#split-tray-panel');
  const splitCountPanel = content.querySelector('#split-count-panel');
  const mergeTrayPanel = content.querySelector('#merge-tray-panel');
  const mergeTrayInput = content.querySelector('#merge-tray');
  const mergeTrayFill = content.querySelector('#merge-tray-fill');
  const mergeTargetPanel = content.querySelector('#merge-target-panel');
  const mergeTargetInput = content.querySelector('#merge-target');
  const mergeTargetFill = content.querySelector('#merge-target-fill');
  const mergeParentPanel = content.querySelector('#merge-parent-panel');
  const mergeParentInput = content.querySelector('#merge-parent-input');
  const mergeParentAdd = content.querySelector('#merge-parent-add');
  const mergeParentBulk = content.querySelector('#merge-parent-bulk');
  const mergeParentClear = content.querySelector('#merge-parent-clear');
  const mergeParentQueueEl = content.querySelector('#merge-parent-queue');
  const createTypePanel = content.querySelector('#create-type-panel');
  const createStagePanel = content.querySelector('#create-stage-panel');
  const createCountPanel = content.querySelector('#create-count-panel');
  const createTrayPanel = content.querySelector('#create-tray-panel');
  const createTypeSelect = content.querySelector('#create-type');
  const createStageSelect = content.querySelector('#create-stage');
  const createCountInput = content.querySelector('#create-count');
  const createTrayInput = content.querySelector('#create-tray');

  let parentQueue = [];
  function resetQueues() {
    parentQueue = [];
    mergeParentBulk.value = '';
    mergeParentInput.value = '';
    mergeTargetInput.value = '';
    renderParentQueue();
  }

  function updateModeUI() {
    const mode = modeSel.value;
    const isCreate = mode === 'create';
    const isSplit = mode === 'split';
    const isMerge = mode === 'merge';
    createTypePanel.style.display = isCreate ? 'block' : 'none';
    createStagePanel.style.display = isCreate ? 'block' : 'none';
    createCountPanel.style.display = isCreate ? 'block' : 'none';
    createTrayPanel.style.display = isCreate ? 'block' : 'none';
    splitParentPanel.style.display = isSplit ? 'block' : 'none';
    splitPanel.style.display = isSplit ? 'block' : 'none';
    splitCountPanel.style.display = isSplit ? 'block' : 'none';
    mergeTrayPanel.style.display = isMerge ? 'block' : 'none';
    mergeTargetPanel.style.display = isMerge ? 'block' : 'none';
    mergeParentPanel.style.display = isMerge ? 'block' : 'none';
    resetQueues();
  }
  modeSel.addEventListener('change', updateModeUI);
  updateModeUI();

  mergeTrayFill.addEventListener('click', () => {
    mergeTrayInput.value = `T-${Math.floor(Math.random() * 90 + 10)}`;
  });
  mergeTargetFill.addEventListener('click', () => {
    mergeTargetInput.value = generateNewDishId();
  });

  function renderParentQueue() {
    mergeParentQueueEl.innerHTML = parentQueue
      .map(
        (id) => `<span class="chip">${id}<button data-id="${id}" aria-label="remove">×</button></span>`
      )
      .join('');
    mergeParentQueueEl.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => {
        parentQueue = parentQueue.filter((x) => x !== btn.dataset.id);
        const bulkList = mergeParentBulk.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((x) => x !== btn.dataset.id);
        mergeParentBulk.value = bulkList.join(', ');
        renderParentQueue();
      })
    );
  }
  function addParent(id) {
    if (!id) return;
    if (parentQueue.includes(id)) return toast('已在队列', 'error');
    mergeParentBulk.value = '';
    parentQueue.push(id);
    renderParentQueue();
  }
  mergeParentAdd.addEventListener('click', () => {
    addParent(mergeParentInput.value.trim());
    mergeParentInput.value = '';
    mergeParentInput.focus();
  });
  mergeParentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      mergeParentAdd.click();
    }
  });
  mergeParentClear.addEventListener('click', () => {
    parentQueue = [];
    mergeParentBulk.value = '';
    renderParentQueue();
  });

  submit.addEventListener('click', () => {
    withSubmit(submit, async () => {
      try {
        if (modeSel.value === 'create') {
          const plantType = createTypeSelect.value;
          const stage = createStageSelect.value;
          const count = Number(createCountInput.value || '0');
          if (count < 1) throw new Error('数量需大于 0');
          const trayId = createTrayInput.value.trim();
          if (!trayId) throw new Error('请填写盘子编号');
          const event = await api.postEvent(
            {
              type: 'create',
              actorId: currentActorId(),
              payload: { type: plantType, stage, count, trayId },
            },
            authToken()
          );
          toast(`创建成功，生成 ${event.outputIds.length} 份`);
          createCountInput.value = '3';
          createTrayInput.value = '';
        } else if (modeSel.value === 'split') {
          const parent = parentInput.value.trim();
          if (!parent) throw new Error('请填写父培养皿');
          const trayId = splitTrayInput.value.trim();
          if (!trayId) throw new Error('请填写盘子编号');
          const count = Number(splitCountInput.value || '0');
          if (!count || count < 1) throw new Error('数量需大于 0');
          await api.postEvent(
            {
              type: 'split',
              actorId: currentActorId(),
              payload: { parentDishId: parent, count, trayId },
            },
            authToken()
          );
          toast(`拆分成功，生成 ${count} 份`);
        } else {
          const parents = normalizeParentIds(parentQueue, mergeParentBulk.value);
          if (parents.length === 0) throw new Error('请扫描/加入父培养皿');
          const trayId = mergeTrayInput.value.trim();
          if (!trayId) throw new Error('请填写盘子编号');
          const targetDishId = mergeTargetInput.value.trim();
          if (targetDishId && parents.includes(targetDishId))
            throw new Error('新培养皿不能与父培养皿相同');
          const occupied = new Set(dishIds());
          if (targetDishId && occupied.has(targetDishId))
            throw new Error(`培养皿已被占用: ${targetDishId}`);
          await api.postEvent(
            {
              type: 'merge',
              actorId: currentActorId(),
              payload: { parentDishIds: parents, trayId, targetDishId },
            },
            authToken()
          );
          toast('合并成功，生成 1 份');
        }
        parentInput.value = '';
        mergeParentInput.value = '';
        resetQueues();
        await refreshEventsAndDishes();
        renderEventLog();
        renderMyHistory();
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '失败', 'error');
      }
    });
  });
}
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: add create mode to split tab, update event display for create/undo"
```

---

### Task 4: Enable undo button + add api.undo (frontend)

**Files:**
- Modify: `src/lib/api.js` (add undo method)
- Modify: `src/main.js` (enable undo button)
- Modify: `index.html` (add undo filter option)

**Step 1: Add undo method to api.js**

In `src/lib/api.js`, add inside the returned object (after `postEvent`):

```js
    undo(token) {
      return request('/api/events/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, token);
    },
```

**Step 2: Enable undo button in main.js**

In `src/main.js`, replace these lines:

```js
undoBtn.addEventListener('click', () => {
  toast('暂不支持撤销', 'error');
});

undoBtn.disabled = true;
```

With:

```js
undoBtn.addEventListener('click', async () => {
  const lastEvent = state.myEvents.find((e) => e.type !== 'undo');
  if (!lastEvent) {
    toast('没有可撤销的操作', 'error');
    return;
  }
  const label = labelOfType(lastEvent.type);
  if (!confirm(`确定撤销最近的操作吗？\n将撤销：${label}`)) return;
  try {
    undoBtn.disabled = true;
    await api.undo(authToken());
    toast('撤销成功');
    await refreshEventsAndDishes();
    renderEventLog();
    renderMyHistory();
  } catch (err) {
    if (handleAuthError(err)) return;
    toast(err.message || '撤销失败', 'error');
  } finally {
    undoBtn.disabled = false;
  }
});
```

**Step 3: Add undo filter option in index.html**

In `index.html`, add inside the `<select id="filter-type">`, after the transfer option:

```html
          <option value="undo">撤销</option>
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/api.js src/main.js index.html
git commit -m "feat: enable undo button with confirmation and api.undo"
```

---

### Task 5: Batch placement UI (frontend)

**Files:**
- Modify: `src/main.js` (rewrite renderPlaceTab)

No backend changes needed — batch placement sends multiple individual place events.

**Step 1: Rewrite renderPlaceTab**

Replace the entire `renderPlaceTab()` function in `src/main.js` with:

```js
function renderPlaceTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">批量上架</div>
      <div class="small">先选位置锁定，再连续添加盘子，最后一次提交</div>
    </section>
    <section class="panel card" id="place-loc-panel">
      <label>上架位置（架/层/位）</label>
      <input id="place-location" placeholder="如 rack-A1" />
      ${helperRow(locationIds(), 'place-location')}
      <button id="place-lock" class="primary-action" style="margin-top:8px;width:100%">锁定位置</button>
    </section>
    <section class="panel card" id="place-tray-panel" style="display:none">
      <div id="place-locked-badge" class="chip-row" style="margin-bottom:8px"></div>
      <label>盘子编号（逐一添加）</label>
      <div class="form-grid">
        <input id="place-tray" placeholder="扫描/输入盘子编号，回车添加" />
        <button id="place-tray-add" type="button">添加</button>
      </div>
      ${helperRow(trayIds(), 'place-tray', 'place-tray-add')}
      <div id="place-tray-queue" class="chip-row" style="margin-top:8px"></div>
    </section>
    <div class="action-row" id="place-action-row" style="display:none">
      <button id="place-submit" class="primary-action">完成上架</button>
      <button id="place-unlock" class="ghost" style="margin-left:8px">更换位置</button>
    </div>
  `;
  wireHelpers(content);

  const locPanel = content.querySelector('#place-loc-panel');
  const locationInput = content.querySelector('#place-location');
  const lockBtn = content.querySelector('#place-lock');
  const trayPanel = content.querySelector('#place-tray-panel');
  const lockedBadge = content.querySelector('#place-locked-badge');
  const trayInput = content.querySelector('#place-tray');
  const trayAddBtn = content.querySelector('#place-tray-add');
  const trayQueueEl = content.querySelector('#place-tray-queue');
  const actionRow = content.querySelector('#place-action-row');
  const submitBtn = content.querySelector('#place-submit');
  const unlockBtn = content.querySelector('#place-unlock');

  let lockedLocation = '';
  let trayList = [];

  function renderTrayQueue() {
    trayQueueEl.innerHTML = trayList
      .map(
        (id) =>
          `<span class="chip">${id}<button data-id="${id}" aria-label="remove">×</button></span>`
      )
      .join('');
    trayQueueEl.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => {
        trayList = trayList.filter((x) => x !== btn.dataset.id);
        renderTrayQueue();
      })
    );
  }

  lockBtn.addEventListener('click', () => {
    const loc = locationInput.value.trim();
    if (!loc) {
      toast('请先填写位置', 'error');
      return;
    }
    lockedLocation = loc;
    locPanel.style.display = 'none';
    trayPanel.style.display = 'block';
    actionRow.style.display = 'flex';
    lockedBadge.innerHTML = `<span class="chip" style="background:var(--sky);color:#fff">位置: ${loc}</span>`;
    trayInput.focus();
  });

  unlockBtn.addEventListener('click', () => {
    lockedLocation = '';
    trayList = [];
    locPanel.style.display = 'block';
    trayPanel.style.display = 'none';
    actionRow.style.display = 'none';
    renderTrayQueue();
  });

  trayAddBtn.addEventListener('click', () => {
    const id = trayInput.value.trim();
    if (!id) return;
    if (trayList.includes(id)) {
      toast('已在队列中', 'error');
      return;
    }
    trayList.push(id);
    trayInput.value = '';
    trayInput.focus();
    renderTrayQueue();
  });

  trayInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trayAddBtn.click();
    }
  });

  submitBtn.addEventListener('click', () => {
    withSubmit(submitBtn, async () => {
      if (trayList.length === 0) {
        toast('请至少添加一个盘子', 'error');
        return;
      }
      try {
        for (const trayId of trayList) {
          await api.postEvent(
            {
              type: 'place',
              actorId: currentActorId(),
              payload: { trayId, locationId: lockedLocation },
            },
            authToken()
          );
        }
        toast(`上架 ${trayList.length} 个盘子 @ ${lockedLocation}`);
        trayList = [];
        renderTrayQueue();
        await refreshEventsAndDishes();
        renderEventLog();
        renderMyHistory();
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '上架失败', 'error');
      }
    });
  });
}
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (no backend changes, UI-only)

**Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: batch placement with location lock and tray queue"
```

---

### Task 6: Input validation improvements

**Files:**
- Modify: `server/domain.js` (add validation)
- Modify: `server/__tests__/domain.test.js` (test new validation)
- Modify: `src/main.js` (client-side checks)

**Step 1: Write failing server-side validation tests**

Append to `server/__tests__/domain.test.js`:

```js
describe('validation', () => {
  it('rejects split count > 50', () => {
    const { domain } = setup();
    expect(() => domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 51 }))
      .toThrow('数量不能超过 50');
  });

  it('rejects merge when targetDishId is in parentDishIds', () => {
    const { domain } = setup();
    expect(() =>
      domain.merge({ parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', targetDishId: 'D-1' })
    ).toThrow('目标培养皿不能与父培养皿相同');
  });

  it('rejects create count > 50', () => {
    const { domain } = setup();
    expect(() => domain.create({ type: '品种A', stage: '萌发', count: 51, trayId: 'T-01' }))
      .toThrow('数量不能超过 50');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: FAIL — expected errors not thrown

**Step 3: Add server-side validation**

In `server/domain.js`:

a) In the `split` function, after `if (!count || count < 1) throw new Error('数量需大于 0');`, add:

```js
    if (count > 50) throw new Error('数量不能超过 50');
```

b) In the `merge` function, after `if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)`, add (before the `const parentPlantIds` line):

```js
    if (targetDishId && parentDishIds.includes(targetDishId))
      throw new Error('目标培养皿不能与父培养皿相同');
```

c) In the `create` function, after `if (!count || count < 1) throw new Error('数量需大于 0');`, add:

```js
    if (count > 50) throw new Error('数量不能超过 50');
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: PASS

**Step 5: Add client-side validation in main.js**

In `src/main.js`, update the **status submit handler** (inside `renderStatusTab`). After `if (!dishId) throw new Error('请填写培养皿 ID');`, add:

```js
        if (!dishIds().includes(dishId)) throw new Error(`培养皿不存在: ${dishId}`);
```

In the **transfer submit handler** (inside `renderTransferTab`). After `if (!fromDishId || !toDishId) throw new Error('请填写旧皿与新皿');`, add:

```js
        if (!dishIds().includes(fromDishId)) throw new Error(`旧培养皿不存在: ${fromDishId}`);
        if (dishIds().includes(toDishId)) throw new Error(`新培养皿已被占用: ${toDishId}`);
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add server/domain.js server/__tests__/domain.test.js src/main.js
git commit -m "feat: add input validation (count limits, target dish checks)"
```
