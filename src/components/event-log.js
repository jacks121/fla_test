// 事件日志列表组件

import { labelOfType } from '../lib/constants.js';
import { escapeHtml } from '../lib/escape.js';

function metaText(e) {
  const parts = [];
  if (e.meta?.trayId) parts.push(`盘子: ${escapeHtml(e.meta.trayId)}`);
  if (e.type === 'create' && e.meta?.plantType) parts.push(`品种: ${escapeHtml(e.meta.plantType)}`);
  if (e.type === 'create' && e.meta?.stage) parts.push(`阶段: ${escapeHtml(e.meta.stage)}`);
  if (e.type === 'place' && e.meta?.locationId) parts.push(`位置: ${escapeHtml(e.meta.locationId)}`);
  if (e.type === 'status') parts.push(`状态: ${escapeHtml(e.meta.status)}`);
  if (e.type === 'transfer') parts.push(`从 ${escapeHtml(e.meta.fromDishId)} 到 ${escapeHtml(e.meta.toDishId)}`);
  if (e.type === 'undo') parts.push(`撤销: ${labelOfType(e.meta?.undoneEventType)}`);
  return parts.join(' · ');
}

const TYPE_BADGE_CLASS = {
  create: 'badge--success',
  split: 'badge--primary',
  merge: 'badge--primary',
  place: 'badge--info',
  status: 'badge--warning',
  transfer: 'badge--secondary',
  undo: 'badge--muted',
};

function renderEventItem(e) {
  const inText = e.inputIds?.length ? escapeHtml(e.inputIds.join(', ')) : '-';
  const outText = e.outputIds?.length ? escapeHtml(e.outputIds.join(', ')) : '-';
  const meta = metaText(e);
  const badgeClass = TYPE_BADGE_CLASS[e.type] || 'badge--muted';
  const time = new Date(e.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(e.ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return `<li class="event-item" data-event-id="${e.id}">
    <div class="event-item__header">
      <span class="badge ${badgeClass}">${labelOfType(e.type)}</span>
      <span class="event-item__time">${date} ${time}</span>
    </div>
    <div class="event-item__meta">
      ${meta ? `<span>${meta}</span>` : ''}
      <span class="event-item__ids">入: ${inText} | 出: ${outText}</span>
    </div>
    <div class="event-item__detail">
      <div>ID: ${e.id}</div>
      <div>操作人: ${e.actorId}</div>
      ${Object.keys(e.meta || {}).length > 0 ? `<div>详情: ${JSON.stringify(e.meta)}</div>` : ''}
    </div>
  </li>`;
}

export function renderEventList(containerId, events, emptyText = '暂无记录') {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!events || events.length === 0) {
    el.innerHTML = `<li class="event-item event-item--empty">${emptyText}</li>`;
    return;
  }
  el.innerHTML = events.map(renderEventItem).join('');
  wireEventExpand(el);
}

function wireEventExpand(list) {
  list.querySelectorAll('.event-item:not(.event-item--empty)').forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('event-item--expanded');
    });
  });
}
