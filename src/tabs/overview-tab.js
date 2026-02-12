// 总览页 Tab — 统计数据 + 快捷操作 + 最近记录

import { iconScan, iconStatus, iconPlus, iconChevronRight } from '../lib/icons.js';
import { labelOfType } from '../lib/constants.js';
import { escapeHtml } from '../lib/escape.js';

export function renderOverviewTab(container, { store, bus }) {
  const state = store.getState();
  const totalPlants = state.dishes?.length || 0;
  const todayEvents = countTodayEvents(state.events || []);
  const recentEvents = (state.myEvents || []).slice(0, 5);

  container.innerHTML = `
    <div class="page-content">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-card__value">${totalPlants}</span>
          <span class="stat-card__label">培养皿总数</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__value">${todayEvents}</span>
          <span class="stat-card__label">今日操作</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__value">${(state.myEvents || []).length}</span>
          <span class="stat-card__label">我的记录</span>
        </div>
      </div>

      <div class="section-title">快捷操作</div>
      <div class="quick-actions">
        <button class="quick-action" data-action="scan">
          <span class="quick-action__icon quick-action__icon--scan">
            ${iconScan({ size: 20 })}
          </span>
          <span class="quick-action__label">扫码操作</span>
        </button>
        <button class="quick-action" data-action="batch-status">
          <span class="quick-action__icon quick-action__icon--check">
            ${iconStatus({ size: 20 })}
          </span>
          <span class="quick-action__label">快速巡检</span>
        </button>
        <button class="quick-action" data-action="create">
          <span class="quick-action__icon quick-action__icon--create">
            ${iconPlus({ size: 20 })}
          </span>
          <span class="quick-action__label">新苗入库</span>
        </button>
      </div>

      <div class="card">
        <div class="card__header">
          <span class="card__title">最近操作</span>
          <button class="btn-sm btn-ghost" data-action="history">
            查看全部 ${iconChevronRight({ size: 14 })}
          </button>
        </div>
        <ul class="event-list" style="margin-top: 8px">
          ${renderRecentEvents(recentEvents)}
        </ul>
      </div>
    </div>
  `;

  // 快捷操作点击
  container.querySelector('[data-action="scan"]')?.addEventListener('click', () => {
    bus.emit('tab:switch', { tab: 'scan' });
  });
  container.querySelector('[data-action="batch-status"]')?.addEventListener('click', () => {
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'status' }), 50);
  });
  container.querySelector('[data-action="create"]')?.addEventListener('click', () => {
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'create' }), 50);
  });
  container.querySelector('[data-action="history"]')?.addEventListener('click', () => {
    bus.emit('tab:switch', { tab: 'history' });
  });
}

function countTodayEvents(events) {
  const today = new Date().toDateString();
  return events.filter((e) => new Date(e.ts).toDateString() === today).length;
}

function renderRecentEvents(events) {
  if (!events || events.length === 0) {
    return '<li class="event-item event-item--empty">暂无操作记录</li>';
  }
  return events
    .map((e) => {
      const time = new Date(e.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const outText = e.outputIds?.length ? escapeHtml(e.outputIds.slice(0, 3).join(', ')) : '';
      return `<li class="event-item" style="cursor:default; padding: 8px 0">
        <div class="event-item__header">
          <span class="badge badge--${badgeType(e.type)}">${labelOfType(e.type)}</span>
          <span class="event-item__time">${time}</span>
        </div>
        ${outText ? `<div class="event-item__ids" style="margin-top:2px">${outText}</div>` : ''}
      </li>`;
    })
    .join('');
}

function badgeType(type) {
  const map = {
    create: 'success', split: 'primary', merge: 'primary',
    place: 'info', status: 'warning', transfer: 'secondary', undo: 'muted',
  };
  return map[type] || 'muted';
}
