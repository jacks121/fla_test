import { createStore } from './lib/domain.js';
import { makeInitialState, plants, dishes, locations } from './lib/mockData.js';

const store = createStore(makeInitialState());
const content = document.getElementById('content');
const tabs = document.querySelectorAll('.tab');
const eventList = document.getElementById('event-list');
const filterType = document.getElementById('filter-type');
const undoBtn = document.getElementById('undo-btn');

let activeTab = 'split';

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
    });
  });
}

function renderSplitTab() {
  content.innerHTML = `
    <section class="card">
      <div class="card-title">拆分/合并</div>
      <div class="small">父扫一次，多子连扫。合并可输入多个父。</div>
    </section>
    <section class="card">
      <label>模式</label>
      <select id="split-mode">
        <option value="split">拆分</option>
        <option value="merge">合并</option>
      </select>
    </section>
    ${inputField('parent-dish', '父培养皿 ID', '如 D-1 或扫码填入')}
    ${helperRow(dishes.slice(0, 5).map((d) => d.id), 'parent-dish')}
    <section class="panel card">
      <label id="child-label">子苗数量</label>
      <input id="child-count" type="number" min="1" value="2" />
    </section>
    <button id="split-submit">提交</button>
  `;
  wireHelpers(content);
  const modeSel = content.querySelector('#split-mode');
  const parentInput = content.querySelector('#parent-dish');
  const countInput = content.querySelector('#child-count');
  const submit = content.querySelector('#split-submit');

  function updateLabel() {
    content.querySelector('#child-label').textContent =
      modeSel.value === 'split' ? '子苗数量' : '生成新苗数量';
  }
  modeSel.addEventListener('change', updateLabel);
  updateLabel();

  submit.addEventListener('click', () => {
    const parent = parentInput.value.trim();
    const count = Number(countInput.value || '0');
    try {
      if (modeSel.value === 'split') {
        store.split({ parentDishId: parent, count });
        toast(`拆分成功，生成 ${count} 份`);
      } else {
        const parents = parent.split(',').map((s) => s.trim()).filter(Boolean);
        store.merge({ parentDishIds: parents, outputs: count });
        toast(`合并成功，生成 ${count} 份`);
      }
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
      <div class="small">位置扫一次，多皿连扫</div>
    </section>
    ${inputField('location-id', '位置码', '如 rack-A1')}
    ${helperRow(locations.map((l) => l.id), 'location-id')}
    <section class="panel card">
      <label>培养皿 ID 列表（逗号分隔或逐一扫码）</label>
      <input id="place-dishes" placeholder="D-1, D-2" />
    </section>
    <button id="place-submit">提交上架</button>
  `;
  wireHelpers(content);
  const locInput = content.querySelector('#location-id');
  const dishInput = content.querySelector('#place-dishes');
  const submit = content.querySelector('#place-submit');

  submit.addEventListener('click', () => {
    const locationId = locInput.value.trim();
    const dishIds = dishInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      store.place({ locationId, dishIds });
      toast(`上架 ${dishIds.length} 份 @ ${locationId}`);
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
