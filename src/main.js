import { createApi } from './lib/api.js';
import { normalizeParentIds } from './lib/merge.js';
import { filterEventsByActor } from './lib/history.js';

const url = new URL(window.location.href);
const apiBase = url.searchParams.get('api') || `${url.protocol}//${url.hostname}:8787`;
const api = createApi(apiBase);
const state = {
  meta: { trays: [], locations: [], statusEnum: [] },
  dishes: [],
  events: [],
  myEvents: [],
};
const tokenKey = 'fla_token';
const userKey = 'fla_user';
const authToken = () => localStorage.getItem(tokenKey);
const authUser = () => {
  try {
    return JSON.parse(localStorage.getItem(userKey) || 'null');
  } catch {
    return null;
  }
};
function clearAuth() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}
const content = document.getElementById('content');
const tabs = document.querySelectorAll('.tab');
const eventList = document.getElementById('event-list');
const myEventList = document.getElementById('my-event-list');
const filterType = document.getElementById('filter-type');
const undoBtn = document.getElementById('undo-btn');
const userPill = document.getElementById('user-pill');
const logoutBtn = document.getElementById('logout-btn');

let activeTab = 'split';
const newDishHints = ['ND-101', 'ND-102', 'ND-103', 'ND-104', 'ND-105'];

function generateNewDishId() {
  return `ND-${Math.floor(Math.random() * 900 + 100)}`;
}

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

function dishIds() {
  return state.dishes.map((d) => d.id);
}

function trayIds() {
  return state.meta.trays.map((t) => t.id);
}

function locationIds() {
  return state.meta.locations.map((l) => l.id);
}

function renderEventLog() {
  const type = filterType.value;
  const events = state.events.filter((e) => type === 'all' || e.type === type);
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

function renderMyHistory() {
  if (!myEventList) return;
  const events = state.myEvents.slice(0, 20);
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

function currentActorId() {
  const user = authUser();
  return user?.id || user?.name || 'emp-01';
}

async function loadState() {
  const token = authToken();
  const [meta, dishes, events] = await Promise.all([
    api.getMeta(token),
    api.getDishes(undefined, token),
    api.getEvents(undefined, token),
  ]);
  state.meta = meta || { trays: [], locations: [], statusEnum: [] };
  state.dishes = dishes || [];
  state.events = events || [];
  state.myEvents = filterEventsByActor(state.events, currentActorId());
}

async function refreshEventsAndDishes() {
  const token = authToken();
  const [dishes, events] = await Promise.all([
    api.getDishes(undefined, token),
    api.getEvents(undefined, token),
  ]);
  state.dishes = dishes || [];
  state.events = events || [];
  state.myEvents = filterEventsByActor(state.events, currentActorId());
}

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

function handleAuthError(err) {
  if (err?.status === 401) {
    clearAuth();
    window.location.href = './login.html';
    return true;
  }
  return false;
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

function renderPlaceTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">批量上架</div>
      <div class="small">盘子编号 + 上架位置</div>
    </section>
    <section class="panel card">
      <label>盘子编号</label>
      <input id="place-tray" placeholder="如 T-01" />
      ${helperRow(trayIds(), 'place-tray')}
    </section>
    <section class="panel card">
      <label>上架位置（架/层/位）</label>
      <input id="place-location" placeholder="如 rack-A1" />
      ${helperRow(locationIds(), 'place-location')}
    </section>
    <div class="action-row">
      <button id="place-submit" class="primary-action">提交上架</button>
    </div>
  `;
  wireHelpers(content);
  const trayInput = content.querySelector('#place-tray');
  const locationInput = content.querySelector('#place-location');
  const submit = content.querySelector('#place-submit');

  submit.addEventListener('click', () => {
    withSubmit(submit, async () => {
      try {
        const trayId = trayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');
        const locationId = locationInput.value.trim();
        if (!locationId) throw new Error('请填写上架位置');
        await api.postEvent(
          {
          type: 'place',
          actorId: currentActorId(),
          payload: { trayId, locationId },
        },
          authToken()
        );
        toast(`上架盘子 ${trayId} @ ${locationId}`);
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

function renderStatusTab() {
  const statusOptions = (state.meta.statusEnum?.length
    ? state.meta.statusEnum
    : ['正常', '感染', '变异']
  )
    .map((status) => `<option value="${status}">${status}</option>`)
    .join('');
  content.innerHTML = `
    <section class="card">
      <div class="card-title">状态更新</div>
      <div class="small">扫皿 + 状态选择</div>
    </section>
    ${inputField('status-dish', '培养皿 ID', '如 D-1')}
    ${helperRow(dishIds().slice(0, 5), 'status-dish')}
    <section class="panel card">
      <label>状态</label>
      <select id="status-select">
        ${statusOptions}
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
    withSubmit(content.querySelector('#status-submit'), async () => {
      try {
        const dishId = dishInput.value.trim();
        if (!dishId) throw new Error('请填写培养皿 ID');
        await api.postEvent(
          {
          type: 'status',
          actorId: currentActorId(),
          payload: { dishId, status: statusSel.value },
        },
          authToken()
        );
        toast('状态已更新');
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

function renderTransferTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">换皿 / 转移</div>
      <div class="small">扫旧皿 → 新皿</div>
    </section>
    ${inputField('old-dish', '旧培养皿 ID', '如 D-1')}
    ${inputField('new-dish', '新培养皿 ID', '如 ND-1')}
    ${helperRow(dishIds().slice(0, 5), 'old-dish')}
    <section class="helper-row" style="margin-top:-6px"> <button class="helper-button" data-fill="new-dish" data-value="ND-${Math.floor(Math.random()*90+10)}">生成新皿ID</button></section>
    <div class="action-row">
      <button id="transfer-submit" class="primary-action">提交转移</button>
    </div>
  `;
  wireHelpers(content);
  const oldInput = content.querySelector('#old-dish');
  const newInput = content.querySelector('#new-dish');
  content.querySelector('#transfer-submit').addEventListener('click', () => {
    withSubmit(content.querySelector('#transfer-submit'), async () => {
      try {
        const fromDishId = oldInput.value.trim();
        const toDishId = newInput.value.trim();
        if (!fromDishId || !toDishId) throw new Error('请填写旧皿与新皿');
        await api.postEvent(
          {
          type: 'transfer',
          actorId: currentActorId(),
          payload: { fromDishId, toDishId },
        },
          authToken()
        );
        toast('已转移');
        oldInput.value = '';
        newInput.value = '';
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
  toast('暂不支持撤销', 'error');
});

undoBtn.disabled = true;

async function bootstrap() {
  if (!authToken()) {
    window.location.href = './login.html';
    return;
  }
  const user = authUser();
  if (userPill && user?.name) userPill.textContent = user.name;
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearAuth();
      window.location.href = './login.html';
    });
  }
  try {
    await loadState();
  } catch (err) {
    if (!handleAuthError(err)) toast('无法连接服务器', 'error');
  }
  switchTab(activeTab);
  renderEventLog();
  renderMyHistory();
}

bootstrap();
