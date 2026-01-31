import { createStore } from './lib/domain.js';
import { makeInitialState, plants, dishes, locations } from './lib/mockData.js';

const store = createStore(makeInitialState());
const content = document.getElementById('content');
const tabs = document.querySelectorAll('.tab');
const eventList = document.getElementById('event-list');
const filterType = document.getElementById('filter-type');
const undoBtn = document.getElementById('undo-btn');

let activeTab = 'split';
let placeQueue = [];

function toast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'error' ? '#b91c1c' : '#111827';
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.classList.remove('show'), 1600);
}

function renderEventLog() {
  const type = filterType.value;
  const events = store.state.events.filter((e) => type === 'all' || e.type === type);
  eventList.innerHTML = events
    .map(
      (e) => `<li class="event-item">
        <div class="event-title">${labelOfType(e.type)} · ${new Date(e.ts).toLocaleTimeString()}</div>
        <div class="event-meta">in: ${e.inputIds.join(', ')} | out: ${e.outputIds.join(', ')}</div>
        ${e.meta ? `<div class="event-meta">${metaText(e)}</div>` : ''}
      </li>`
    )
    .join('');
}

function labelOfType(t) {
  return {
    split: '拆分',
    merge: '合并',
    place: '上架',
    status: '状态',
    transfer: '转移',
    create: '创建',
  }[t] || t;
}

function metaText(e) {
  if (e.type === 'place') return `位置: ${e.meta.locationId}`;
  if (e.type === 'status') return `状态: ${e.meta.status}`;
  if (e.type === 'transfer') return `从 ${e.meta.fromDishId} 到 ${e.meta.toDishId}`;
  return '';
}

function inputField(id, label, placeholder = '') {
  return `<section class="panel card">
    <label for="${id}">${label}</label>
    <input id="${id}" placeholder="${placeholder}" />
  </section>`;
}

function helperRow(ids, targetId) {
  return `<div class="helper-row">${ids
    .map((id) => `<button class="helper-button" data-fill="${targetId}" data-value="${id}">${id}</button>`)
    .join('')}</div>`;
}

function wireHelpers(root) {
  root.querySelectorAll('.helper-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = root.querySelector(`#${btn.dataset.fill}`);
      if (target) target.value = btn.dataset.value;
      target?.focus();
    });
  });
}

function renderSplitTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">拆分/合并</div>
      <div class="small">拆分：父→子队列；合并：先选目标皿，再扫多个父。</div>
    </section>
    <section class="card">
      <label>模式</label>
      <select id="split-mode">
        <option value="split">拆分</option>
        <option value="merge">合并</option>
      </select>
    </section>
    ${inputField('parent-dish', '父培养皿 ID（仅拆分模式，单个）', '如 D-1 或扫码填入')}
    ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'parent-dish')}

    <section class="panel card" id="split-child-panel">
      <label>目标培养皿（逐一扫码加入队列）</label>
      <div class="form-grid">
        <input id="child-dish-input" placeholder="扫描/输入皿ID，回车加入" />
        <button id="child-add" type="button">加入队列</button>
      </div>
      <input id="child-dishes" placeholder="或直接粘贴逗号分隔列表" />
      <div id="child-queue" class="chip-row"></div>
    </section>

    <section class="panel card" id="merge-target-panel">
      <label>合并目标培养皿（仅 1 个，需先扫描）</label>
      <div class="form-grid">
        <input id="merge-target" placeholder="扫描/输入目标皿ID" />
        <button id="merge-target-fill" type="button">生成新皿ID</button>
      </div>
      ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'merge-target')}
    </section>

    <section class="panel card" id="merge-parent-panel">
      <label>父培养皿（多个，逐一扫码加入队列）</label>
      <div class="form-grid">
        <input id="merge-parent-input" placeholder="扫描/输入父皿ID，回车加入" />
        <button id="merge-parent-add" type="button">加入队列</button>
      </div>
      <input id="merge-parent-bulk" placeholder="或直接粘贴逗号分隔列表" />
      <div id="merge-parent-queue" class="chip-row"></div>
    </section>
    <button id="split-submit">提交</button>
  `;
  wireHelpers(content);
  const modeSel = content.querySelector('#split-mode');
  const parentInput = content.querySelector('#parent-dish');
  const submit = content.querySelector('#split-submit');
  const childInput = content.querySelector('#child-dish-input');
  const childBulk = content.querySelector('#child-dishes');
  const childAdd = content.querySelector('#child-add');
  const childQueueEl = content.querySelector('#child-queue');
  const splitPanel = content.querySelector('#split-child-panel');
  const mergeTargetPanel = content.querySelector('#merge-target-panel');
  const mergeTargetInput = content.querySelector('#merge-target');
  const mergeTargetFill = content.querySelector('#merge-target-fill');
  const mergeParentPanel = content.querySelector('#merge-parent-panel');
  const mergeParentInput = content.querySelector('#merge-parent-input');
  const mergeParentAdd = content.querySelector('#merge-parent-add');
  const mergeParentBulk = content.querySelector('#merge-parent-bulk');
  const mergeParentQueueEl = content.querySelector('#merge-parent-queue');

  let childQueue = [];
  let parentQueue = [];
  const parentCard = parentInput.closest('.panel.card') || parentInput.parentElement;

  function renderChildQueue() {
    childQueueEl.innerHTML = childQueue
      .map(
        (id) => `<span class="chip">${id}<button data-id="${id}" aria-label="remove">×</button></span>`
      )
      .join('');
    childQueueEl.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => {
        childQueue = childQueue.filter((x) => x !== btn.dataset.id);
        renderChildQueue();
      })
    );
  }
  function addChild(id) {
    if (!id) return;
    if (childQueue.includes(id)) return toast('已在队列', 'error');
    childQueue.push(id);
    renderChildQueue();
  }
  childAdd.addEventListener('click', () => {
    addChild(childInput.value.trim());
    childInput.value = '';
    childInput.focus();
  });
  childInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      childAdd.click();
    }
  });

  function updateModeUI() {
    const isSplit = modeSel.value === 'split';
    splitPanel.style.display = isSplit ? 'block' : 'none';
    mergeTargetPanel.style.display = isSplit ? 'none' : 'block';
    mergeParentPanel.style.display = isSplit ? 'none' : 'block';
    // 拆分模式才显示单个父皿输入卡片
    if (parentCard) parentCard.style.display = isSplit ? 'block' : 'none';
  }
  modeSel.addEventListener('change', updateModeUI);
  updateModeUI();

  mergeTargetFill.addEventListener('click', () => {
    mergeTargetInput.value = `MD-${Math.floor(Math.random() * 900 + 100)}`;
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
        renderParentQueue();
      })
    );
  }
  function addParent(id) {
    if (!id) return;
    if (parentQueue.includes(id)) return toast('已在队列', 'error');
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

  submit.addEventListener('click', () => {
    const bulk = childBulk.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const targets = [...childQueue, ...bulk];
    try {
      if (modeSel.value === 'split') {
        const parent = parentInput.value.trim();
        if (!parent) throw new Error('请填写父培养皿');
        if (targets.length === 0) throw new Error('请先扫描/加入目标培养皿');
        store.split({ parentDishId: parent, childDishIds: targets });
        toast(`拆分成功，生成 ${targets.length} 份`);
      } else {
        const parentBulkList = mergeParentBulk.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const parents = [...parentQueue, ...parentBulkList];
        if (parents.length === 0) throw new Error('请扫描/加入父培养皿');
        const targetDishId = mergeTargetInput.value.trim();
        if (!targetDishId) throw new Error('请扫描/填写目标培养皿');
        store.merge({ parentDishIds: parents, targetDishId });
        toast('合并成功，生成 1 份');
      }
      childQueue = [];
      childBulk.value = '';
      mergeTargetInput.value = '';
      parentQueue = [];
      mergeParentBulk.value = '';
      mergeParentInput.value = '';
      renderChildQueue();
      renderParentQueue();
      renderEventLog();
    } catch (err) {
      toast(err.message || '失败', 'error');
    }
  });
}

function renderPlaceTab() {
  placeQueue = [];
  content.innerHTML = `
    <section class="card">
      <div class="card-title">批量上架</div>
      <div class="small">位置扫一次，多皿连扫</div>
    </section>
    ${inputField('location-id', '位置码', '如 rack-A1')}
    ${helperRow(locations.map((l) => l.id), 'location-id')}
    <section class="panel card">
      <label>培养皿 ID 列表（逗号分隔或逐一扫码）</label>
      <div class="form-grid">
        <input id="place-dish-input" placeholder="扫描或输入单个皿ID，回车加入" />
        <button id="place-add" type="button">加入队列</button>
      </div>
      <input id="place-dishes" placeholder="或直接粘贴逗号分隔列表" />
      <div id="place-queue" class="chip-row"></div>
    </section>
    <button id="place-submit">提交上架</button>
  `;
  wireHelpers(content);
  const locInput = content.querySelector('#location-id');
  const dishInput = content.querySelector('#place-dishes');
  const singleInput = content.querySelector('#place-dish-input');
  const addBtn = content.querySelector('#place-add');
  const queueEl = content.querySelector('#place-queue');
  const submit = content.querySelector('#place-submit');

  function renderQueue() {
    queueEl.innerHTML = placeQueue
      .map(
        (id) =>
          `<span class="chip">${id}<button data-id="${id}" aria-label="remove">×</button></span>`
      )
      .join('');
    queueEl.querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => {
        placeQueue = placeQueue.filter((x) => x !== btn.dataset.id);
        renderQueue();
      })
    );
  }
  function addToQueue(id) {
    if (!id) return;
    if (placeQueue.includes(id)) return toast('已在队列', 'error');
    placeQueue.push(id);
    renderQueue();
  }
  addBtn.addEventListener('click', () => {
    addToQueue(singleInput.value.trim());
    singleInput.value = '';
    singleInput.focus();
  });
  singleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  });

  submit.addEventListener('click', () => {
    const locationId = locInput.value.trim();
    const manualList = dishInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const dishIds = [...placeQueue, ...manualList];
    try {
      store.place({ locationId, dishIds });
      toast(`上架 ${dishIds.length} 份 @ ${locationId}`);
      placeQueue = [];
      renderQueue();
      dishInput.value = '';
      singleInput.value = '';
      renderEventLog();
    } catch (err) {
      toast(err.message || '失败', 'error');
    }
  });
}

function renderStatusTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">状态更新</div>
      <div class="small">扫皿 + 状态选择</div>
    </section>
    ${inputField('status-dish', '培养皿 ID', '如 D-1')}
    ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'status-dish')}
    <section class="panel card">
      <label>状态</label>
      <select id="status-select">
        <option value="正常">正常</option>
        <option value="感染">感染</option>
        <option value="变异">变异</option>
      </select>
    </section>
    <button id="status-submit">提交状态</button>
  `;
  wireHelpers(content);
  const dishInput = content.querySelector('#status-dish');
  const statusSel = content.querySelector('#status-select');
  content.querySelector('#status-submit').addEventListener('click', () => {
    try {
      store.updateStatus({ dishId: dishInput.value.trim(), status: statusSel.value });
      toast('状态已更新');
      renderEventLog();
    } catch (err) {
      toast(err.message || '失败', 'error');
    }
  });
}

function renderTransferTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">换皿 / 转移</div>
      <div class="small">扫旧皿 → 新皿</div>
    </section>
    ${inputField('old-dish', '旧培养皿 ID', '如 D-1')}
    ${inputField('new-dish', '新培养皿 ID', '如 ND-1')}
    ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'old-dish')}
    <section class="helper-row" style="margin-top:-6px"> <button class="helper-button" data-fill="new-dish" data-value="ND-${Math.floor(Math.random()*90+10)}">生成新皿ID</button></section>
    <button id="transfer-submit">提交转移</button>
  `;
  wireHelpers(content);
  const oldInput = content.querySelector('#old-dish');
  const newInput = content.querySelector('#new-dish');
  content.querySelector('#transfer-submit').addEventListener('click', () => {
    try {
      store.transfer({ fromDishId: oldInput.value.trim(), toDishId: newInput.value.trim() });
      toast('已转移');
      oldInput.value = '';
      newInput.value = '';
      renderEventLog();
    } catch (err) {
      toast(err.message || '失败', 'error');
    }
  });
}

function switchTab(tab) {
  activeTab = tab;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab === 'split') renderSplitTab();
  if (tab === 'place') renderPlaceTab();
  if (tab === 'status') renderStatusTab();
  if (tab === 'transfer') renderTransferTab();
}

tabs.forEach((t) =>
  t.addEventListener('click', () => {
    switchTab(t.dataset.tab);
  })
);

filterType.addEventListener('change', renderEventLog);
undoBtn.addEventListener('click', () => {
  store.undoLast();
  renderEventLog();
  toast('已撤销最近一步');
});

// initial render
switchTab(activeTab);
renderEventLog();
