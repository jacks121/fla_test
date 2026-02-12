// 扫码 Tab — 全局扫码入口，智能识别跳转

import { iconScan, iconCamera } from '../lib/icons.js';
import { startScan } from '../lib/scanner.js';
import { toast } from '../components/toast.js';
import { escapeHtml } from '../lib/escape.js';

export function renderScanTab(container, { store, bus }) {
  container.innerHTML = `
    <div class="page-content" style="text-align: center; padding-top: 24px">
      <div class="card">
        <div style="padding: 24px 0">
          <div style="margin: 0 auto 16px; width: 64px; height: 64px; border-radius: 50%; background: var(--color-primary-soft); display: flex; align-items: center; justify-content: center; color: var(--color-primary)">
            ${iconCamera({ size: 28 })}
          </div>
          <div class="card__title" style="font-size: 16px; margin-bottom: 4px">扫码操作</div>
          <div class="card__sub">扫描培养皿、盘子或位置二维码，系统自动识别类型</div>
          <button class="btn-primary" id="scan-start-btn" style="margin-top: 20px; max-width: 200px; margin-left: auto; margin-right: auto">
            ${iconScan({ size: 18 })} 开始扫码
          </button>
        </div>
      </div>

      <div class="section-title" style="text-align: left; margin-top: 24px">扫码后自动识别</div>
      <div class="card" style="text-align: left">
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px">
          <div style="display: flex; gap: 10px; align-items: start">
            <span class="badge badge--primary" style="flex-shrink: 0">D-xx</span>
            <span class="card__sub">培养皿 — 可选择状态更新、拆分或转移</span>
          </div>
          <div style="display: flex; gap: 10px; align-items: start">
            <span class="badge badge--info" style="flex-shrink: 0">T-xx</span>
            <span class="card__sub">盘子 — 进入上架流程</span>
          </div>
          <div style="display: flex; gap: 10px; align-items: start">
            <span class="badge badge--success" style="flex-shrink: 0">rack-xx</span>
            <span class="card__sub">位置 — 自动锁定上架位置</span>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#scan-start-btn')?.addEventListener('click', () => {
    startScan((text) => {
      handleScanResult(text, { bus, store });
    });
  });
}

function handleScanResult(text, { bus, store }) {
  const trimmed = text.trim();

  if (trimmed.startsWith('D-') || trimmed.startsWith('ND-')) {
    // 培养皿 — 弹出操作选择
    showDishActionSheet(trimmed, bus);
  } else if (trimmed.startsWith('T-')) {
    // 盘子 — 进入上架
    toast(`盘子 ${trimmed} — 跳转上架`, 'info');
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'place', prefill: { trayId: trimmed } }), 50);
  } else if (trimmed.startsWith('rack-')) {
    // 位置 — 进入上架并锁定位置
    toast(`位置 ${trimmed} — 跳转上架`, 'info');
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'place', prefill: { locationId: trimmed } }), 50);
  } else {
    toast(`未识别: ${trimmed}`, 'warning');
  }
}

function showDishActionSheet(dishId, bus) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog" style="max-width: 320px">
      <div class="dialog__title">培养皿 ${escapeHtml(dishId)}</div>
      <div class="dialog__body">请选择要执行的操作：</div>
      <div style="display: flex; flex-direction: column; gap: 8px">
        <button class="btn-primary" data-action="status">状态更新</button>
        <button class="btn-ghost" data-action="split">拆分</button>
        <button class="btn-ghost" data-action="transfer">转移换皿</button>
        <button class="btn-ghost" data-action="cancel" style="color: var(--color-text-muted)">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('[data-action="status"]')?.addEventListener('click', () => {
    close();
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'status', prefill: { dishId } }), 50);
  });
  overlay.querySelector('[data-action="split"]')?.addEventListener('click', () => {
    close();
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'split', prefill: { parentDishId: dishId } }), 50);
  });
  overlay.querySelector('[data-action="transfer"]')?.addEventListener('click', () => {
    close();
    bus.emit('tab:switch', { tab: 'ops' });
    setTimeout(() => bus.emit('ops:navigate', { page: 'transfer', prefill: { fromDishId: dishId } }), 50);
  });
  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
