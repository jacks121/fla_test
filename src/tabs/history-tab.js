// 历史 Tab — 我的记录 / 全部记录，带筛选

import { renderEventList } from '../components/event-log.js';
import { EVENT_TYPES, labelOfType } from '../lib/constants.js';
import { iconFilter } from '../lib/icons.js';

export function renderHistoryTab(container, { store, bus }) {
  let activeSegment = 'mine'; // 'mine' | 'all'
  let filterType = 'all';

  render();

  function render() {
    const state = store.getState();
    const events = activeSegment === 'mine' ? (state.myEvents || []) : (state.events || []);
    const filtered = filterType === 'all' ? events : events.filter((e) => e.type === filterType);

    container.innerHTML = `
      <div class="page-content">
        <div class="segment-control" style="margin-bottom: 12px">
          <button class="segment-control__item ${activeSegment === 'mine' ? 'segment-control__item--active' : ''}" data-seg="mine">我的记录</button>
          <button class="segment-control__item ${activeSegment === 'all' ? 'segment-control__item--active' : ''}" data-seg="all">全部记录</button>
        </div>

        <div class="filter-bar">
          <select id="history-filter">
            <option value="all">全部类型</option>
            ${EVENT_TYPES.map((t) => `<option value="${t}" ${filterType === t ? 'selected' : ''}>${labelOfType(t)}</option>`).join('')}
          </select>
        </div>

        <div class="card">
          <div class="card__header" style="margin-bottom: 8px">
            <span class="card__title">${activeSegment === 'mine' ? '我的操作记录' : '全部事件日志'}</span>
            <span class="badge badge--muted">${filtered.length} 条</span>
          </div>
          <ul class="event-list" id="history-list"></ul>
        </div>
      </div>
    `;

    renderEventList('history-list', filtered.slice(0, 50),
      activeSegment === 'mine' ? '暂无操作记录' : '暂无事件');

    // 分段切换
    container.querySelectorAll('[data-seg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSegment = btn.dataset.seg;
        render();
      });
    });

    // 类型筛选
    container.querySelector('#history-filter')?.addEventListener('change', (e) => {
      filterType = e.target.value;
      render();
    });
  }
}
