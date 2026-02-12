// Chip 队列组件 — 可增删的标签队列

import { iconClose } from '../lib/icons.js';
import { escapeHtml } from '../lib/escape.js';

export function renderChipQueue(containerId) {
  return `<div id="${containerId}" class="chip-queue"></div>`;
}

export function updateChipQueue(containerId, items, onRemove) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<span class="chip-queue__empty">暂无项目</span>';
    return;
  }
  el.innerHTML = items
    .map(
      (id) =>
        `<span class="chip">
          <span class="chip__text">${escapeHtml(id)}</span>
          <button class="chip__remove" data-id="${escapeHtml(id)}" aria-label="移除 ${escapeHtml(id)}">
            ${iconClose({ size: 12 })}
          </button>
        </span>`
    )
    .join('');
  el.querySelectorAll('.chip__remove').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (onRemove) onRemove(btn.dataset.id);
    })
  );
}
