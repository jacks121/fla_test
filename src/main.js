import { createStore } from './lib/domain.js';
import { makeInitialState, plants, dishes, locations, trays } from './lib/mockData.js';

const store = createStore(makeInitialState());
const content = document.getElementById('content');
const tabs = document.querySelectorAll('.tab');
const eventList = document.getElementById('event-list');
const filterType = document.getElementById('filter-type');
const undoBtn = document.getElementById('undo-btn');

let activeTab = 'split';
const trayHints = trays.map((t) => t.id);

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
      (e) => {
        const inText = e.inputIds.length ? e.inputIds.join(', ') : '-';
        const outText = e.outputIds.length ? e.outputIds.join(', ') : '-';
        const meta = metaText(e);
        return `<li class="event-item">
          <div class="event-title">${labelOfType(e.type)} · ${new Date(e.ts).toLocaleTimeString()}</div>
          <div class="event-meta">in: ${inText} | out: ${outText}</div>
          ${meta ? `<div class="event-meta">${meta}</div>` : ''}
        </li>`;
      }
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
  const parts = [];
  if (e.meta?.trayId) parts.push(`盘子: ${e.meta.trayId}`);
  if (e.type === 'place' && e.meta?.locationId) parts.push(`位置: ${e.meta.locationId}`);
  if (e.type === 'status') parts.push(`状态: ${e.meta.status}`);
  if (e.type === 'transfer') parts.push(`从 ${e.meta.fromDishId} 到 ${e.meta.toDishId}`);
  return parts.join(' · ');
}

function inputField(id, label, placeholder = '') {
  return `<section class="panel card">
    <label for="${id}">${label}</label>
    <input id="${id}" placeholder="${placeholder}" />
  </section>`;
}

function helperRow(ids, targetId, triggerId = '') {
  return ids.length
    ? `<div class="helper-row">${ids
    .map(
      (id) =>
        `<button class="helper-button" data-fill="${targetId}" data-value="${id}"${
          triggerId ? ` data-trigger="${triggerId}"` : ''
        }>${id}</button>`
    )
    .join('')}</div>`
    : '';
}

function wireHelpers(root) {
  root.querySelectorAll('.helper-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = root.querySelector(`#${btn.dataset.fill}`);
      if (target) target.value = btn.dataset.value;
      target?.focus();
      const trigger = btn.dataset.trigger;
      if (trigger) {
        const tBtn = root.querySelector(`#${trigger}`);
        tBtn?.click();
      }
    });
  });
}

function renderSplitTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">拆分/合并</div>
      <div class="small">拆分：父皿 + 盘号 + 数量；合并：盘号 + 多父皿。</div>
    </section>
    <section class="card">
      <label>模式</label>
      <select id="split-mode">
        <option value="split">拆分</option>
        <option value="merge">合并</option>
      </select>
    </section>
    <section class="panel card" id="split-parent-panel">
      <label for="parent-dish">父培养皿 ID（仅拆分模式，单个）</label>
      <input id="parent-dish" placeholder="如 D-1 或扫码填入" />
      ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'parent-dish')}
    </section>

    <section class="panel card" id="split-tray-panel">
      <label>盘子编号（拆分结果所在盘）</label>
      <input id="split-tray" placeholder="如 T-01" />
      ${helperRow(trayHints, 'split-tray')}
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
      ${helperRow(trayHints, 'merge-tray')}
    </section>

  <section class="panel card" id="merge-parent-panel">
    <label>父培养皿（多个，逐一扫码加入队列）</label>
    <div class="form-grid">
      <input id="merge-parent-input" placeholder="扫描/输入父皿ID，回车加入" />
      <button id="merge-parent-add" type="button">加入队列</button>
    </div>
    <input id="merge-parent-bulk" placeholder="或直接粘贴逗号分隔列表" />
    ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'merge-parent-input', 'merge-parent-add')}
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
  const mergeTargetPanel = content.querySelector('#merge-tray-panel');
  const mergeTrayInput = content.querySelector('#merge-tray');
  const mergeTrayFill = content.querySelector('#merge-tray-fill');
  const mergeParentPanel = content.querySelector('#merge-parent-panel');
  const mergeParentInput = content.querySelector('#merge-parent-input');
  const mergeParentAdd = content.querySelector('#merge-parent-add');
  const mergeParentBulk = content.querySelector('#merge-parent-bulk');
  const mergeParentClear = content.querySelector('#merge-parent-clear');
  const mergeParentQueueEl = content.querySelector('#merge-parent-queue');

  let parentQueue = [];
  function resetQueues() {
    parentQueue = [];
    mergeParentBulk.value = '';
    mergeParentInput.value = '';
    mergeTrayInput.value = '';
    splitTrayInput.value = '';
    splitCountInput.value = '3';
    renderParentQueue();
  }

  function updateModeUI() {
    const isSplit = modeSel.value === 'split';
    splitPanel.style.display = isSplit ? 'block' : 'none';
    splitCountPanel.style.display = isSplit ? 'block' : 'none';
    mergeTargetPanel.style.display = isSplit ? 'none' : 'block';
    mergeParentPanel.style.display = isSplit ? 'none' : 'block';
    // 拆分模式才显示父皿输入块（含 helper）
    if (splitParentPanel) splitParentPanel.style.display = isSplit ? 'block' : 'none';
    resetQueues();
  }
  modeSel.addEventListener('change', updateModeUI);
  updateModeUI();

  mergeTrayFill.addEventListener('click', () => {
    mergeTrayInput.value = `T-${Math.floor(Math.random() * 90 + 10)}`;
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
    try {
      if (modeSel.value === 'split') {
        const parent = parentInput.value.trim();
        if (!parent) throw new Error('请填写父培养皿');
        const trayId = splitTrayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');
        const count = Number(splitCountInput.value || '0');
        if (!count || count < 1) throw new Error('数量需大于 0');
        store.split({ parentDishId: parent, count, trayId });
        toast(`拆分成功，生成 ${count} 份`);
      } else {
        const parentBulkList = mergeParentBulk.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const parents = Array.from(new Set([...parentQueue, ...parentBulkList]));
        if (parents.length === 0) throw new Error('请扫描/加入父培养皿');
        const trayId = mergeTrayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');
        store.merge({ parentDishIds: parents, trayId });
        toast('合并成功，生成 1 份');
      }
      splitTrayInput.value = '';
      splitCountInput.value = '3';
      mergeTrayInput.value = '';
      resetQueues();
      renderEventLog();
    } catch (err) {
      toast(err.message || '失败', 'error');
    }
  });
}

function renderPlaceTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">批量上架</div>
      <div class="small">只输入盘子编号即可记录上架</div>
    </section>
    <section class="panel card">
      <label>盘子编号</label>
      <input id="place-tray" placeholder="如 T-01" />
      ${helperRow(trayHints, 'place-tray')}
    </section>
    <div class="action-row">
      <button id="place-submit" class="primary-action">提交上架</button>
    </div>
  `;
  wireHelpers(content);
  const trayInput = content.querySelector('#place-tray');
  const submit = content.querySelector('#place-submit');

  submit.addEventListener('click', () => {
    try {
      const trayId = trayInput.value.trim();
      if (!trayId) throw new Error('请填写盘子编号');
      store.place({ trayId });
      toast(`上架盘子 ${trayId}`);
      trayInput.value = '';
      trayInput.blur();
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
    <div class="action-row">
      <button id="status-submit" class="primary-action">提交状态</button>
    </div>
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
    <div class="action-row">
      <button id="transfer-submit" class="primary-action">提交转移</button>
    </div>
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
