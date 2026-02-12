// Toast 全局提示组件

import { iconCheck, iconClose, iconAlert, iconInfo } from '../lib/icons.js';
import { escapeHtml } from '../lib/escape.js';

let toastEl = null;
let hideTimer = null;

const ICON_MAP = {
  success: iconCheck,
  error: iconClose,
  warning: iconAlert,
  info: iconInfo,
};

const BG_MAP = {
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-text)',
};

function ensureToast() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  return toastEl;
}

export function toast(msg, type = 'info', duration = 2000) {
  const el = ensureToast();
  if (hideTimer) clearTimeout(hideTimer);
  const iconFn = ICON_MAP[type] || ICON_MAP.info;
  el.innerHTML = `<span class="toast__icon">${iconFn({ size: 16 })}</span><span class="toast__text">${escapeHtml(msg)}</span>`;
  el.style.background = BG_MAP[type] || BG_MAP.info;
  el.classList.remove('toast--show');
  requestAnimationFrame(() => {
    el.classList.add('toast--show');
  });
  hideTimer = setTimeout(() => {
    el.classList.remove('toast--show');
  }, duration);
}
