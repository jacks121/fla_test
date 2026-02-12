// 更多 Tab — 撤销、标签打印、用户信息、退出

import {
  iconUndo, iconPrint, iconUser, iconLogout, iconChevronRight,
  iconChevronLeft, iconSettings
} from '../lib/icons.js';
import { toast } from '../components/toast.js';
import { getToken, getUser, clearAuth, currentActorId, handleAuthError } from '../lib/auth.js';
import { labelOfType } from '../lib/constants.js';
import { escapeHtml } from '../lib/escape.js';
import { renderLabelPrintPage } from './more/label-print-page.js';
import { persistMode } from '../lib/mode.js';

export function renderMoreTab(container, ctx) {
  const { store, api, refreshData, bus, mode } = ctx;
  const user = getUser();
  const state = store.getState();
  const lastEvent = (state.myEvents || []).find((e) => e.type !== 'undo');

  renderMenu();

  function renderMenu() {
    container.innerHTML = `
      <div class="page-content">
        <div class="card" style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-primary-soft); display: flex; align-items: center; justify-content: center; color: var(--color-primary)">
            ${iconUser({ size: 20 })}
          </div>
          <div style="flex: 1">
            <div style="font-weight: 700; font-size: 15px">${escapeHtml(user?.name || '未知用户')}</div>
            <div style="font-size: 12px; color: var(--color-text-secondary)">角色: ${user?.role === 'admin' ? '管理员' : '操作员'}</div>
          </div>
        </div>

        <div class="section-title">工具</div>
        <div class="menu-list">
          <button class="menu-item" data-action="undo">
            <span class="menu-item__icon" style="background: var(--color-warning-soft); color: var(--color-warning)">
              ${iconUndo({ size: 18 })}
            </span>
            <span class="menu-item__content">
              <span class="menu-item__title">撤销最近操作</span>
              <span class="menu-item__desc">${lastEvent ? `最近: ${labelOfType(lastEvent.type)} (${timeSince(lastEvent.ts)})` : '无可撤销的操作'}</span>
            </span>
            <span class="menu-item__arrow">${iconChevronRight({ size: 16 })}</span>
          </button>
          <button class="menu-item" data-action="labels">
            <span class="menu-item__icon" style="background: var(--color-primary-soft); color: var(--color-primary)">
              ${iconPrint({ size: 18 })}
            </span>
            <span class="menu-item__content">
              <span class="menu-item__title">标签打印</span>
              <span class="menu-item__desc">生成二维码标签，批量打印</span>
            </span>
            <span class="menu-item__arrow">${iconChevronRight({ size: 16 })}</span>
          </button>
        </div>

        <div class="section-title" style="margin-top: 16px">系统</div>
        <div class="menu-list">
          <button class="menu-item" data-action="toggle-mode">
            <span class="menu-item__icon" style="background: var(--color-primary-soft); color: var(--color-primary)">
              ${iconSettings({ size: 18 })}
            </span>
            <span class="menu-item__content">
              <span class="menu-item__title">数据模式</span>
              <span class="menu-item__desc">当前: ${mode === 'local' ? '本地模式' : '服务器模式'}</span>
            </span>
            <span class="menu-item__arrow">${iconChevronRight({ size: 16 })}</span>
          </button>
        </div>

        <div class="section-title" style="margin-top: 16px">账户</div>
        <div class="menu-list">
          <button class="menu-item menu-item--danger" data-action="logout">
            <span class="menu-item__icon">
              ${iconLogout({ size: 18 })}
            </span>
            <span class="menu-item__content">
              <span class="menu-item__title">退出登录</span>
            </span>
          </button>
        </div>
      </div>
    `;

    container.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
      renderUndoPage();
    });

    container.querySelector('[data-action="labels"]')?.addEventListener('click', () => {
      renderLabelsSubPage();
    });

    container.querySelector('[data-action="toggle-mode"]')?.addEventListener('click', () => {
      const newMode = mode === 'local' ? 'server' : 'local';
      if (confirm(`切换到${newMode === 'local' ? '本地' : '服务器'}模式？页面将重新加载。`)) {
        persistMode(newMode);
        const url = new URL(window.location.href);
        url.searchParams.set('mode', newMode);
        window.location.href = url.toString();
      }
    });

    container.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
      if (!confirm('确定退出登录？')) return;
      try {
        await api.logout(getToken());
      } catch {
        // 忽略，本地清除即可
      }
      clearAuth();
      window.location.href = './login.html';
    });
  }

  function renderUndoPage() {
    const state = store.getState();
    const lastEvent = (state.myEvents || []).find((e) => e.type !== 'undo');

    container.innerHTML = `
      <div class="sub-header">
        <button class="sub-header__back" id="undo-back" aria-label="返回">
          ${iconChevronLeft({ size: 20 })}
        </button>
        <div class="sub-header__title">撤销操作</div>
      </div>
      <div class="page-content">
        ${lastEvent ? renderUndoCard(lastEvent) : `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state__icon">${iconUndo({ size: 40 })}</div>
              <div class="empty-state__text">没有可撤销的操作</div>
            </div>
          </div>
        `}
      </div>
      ${lastEvent ? `
        <div class="action-bar">
          <button class="btn-danger" id="undo-confirm">确认撤销</button>
        </div>
      ` : ''}
    `;

    container.querySelector('#undo-back')?.addEventListener('click', renderMenu);

    container.querySelector('#undo-confirm')?.addEventListener('click', async () => {
      if (!confirm(`确定撤销这个操作吗？\n将撤销: ${labelOfType(lastEvent.type)}`)) return;

      const btn = container.querySelector('#undo-confirm');
      btn.disabled = true;
      btn.textContent = '撤销中...';

      try {
        await api.undo(getToken());
        toast('撤销成功', 'success');
        await refreshData();
        renderMenu();
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '撤销失败', 'error');
        btn.disabled = false;
        btn.textContent = '确认撤销';
      }
    });
  }

  function renderLabelsSubPage() {
    container.innerHTML = `
      <div class="sub-header">
        <button class="sub-header__back" id="labels-back" aria-label="返回">
          ${iconChevronLeft({ size: 20 })}
        </button>
        <div class="sub-header__title">标签打印</div>
      </div>
      <div id="labels-page-content"></div>
    `;

    container.querySelector('#labels-back')?.addEventListener('click', renderMenu);

    const pageContent = container.querySelector('#labels-page-content');
    renderLabelPrintPage(pageContent);
  }
}

function renderUndoCard(event) {
  const ts = new Date(event.ts);
  const elapsed = Date.now() - ts.getTime();
  const remainMs = 5 * 60 * 1000 - elapsed;
  const expired = remainMs <= 0;

  return `
    <div class="card ${expired ? '' : 'card--accent-status'}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <span class="badge badge--warning">${labelOfType(event.type)}</span>
        <span style="font-size: 12px; color: var(--color-text-muted)">${ts.toLocaleString('zh-CN')}</span>
      </div>
      <div style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 8px">
        ${event.inputIds?.length ? `输入: ${event.inputIds.join(', ')}` : ''}
        ${event.outputIds?.length ? `<br>输出: ${event.outputIds.join(', ')}` : ''}
      </div>
      ${expired ? `
        <div style="padding: 8px 12px; background: var(--color-danger-soft); border-radius: var(--radius-md); font-size: 13px; color: var(--color-danger)">
          该操作已超过 5 分钟，无法撤销
        </div>
      ` : `
        <div style="padding: 8px 12px; background: var(--color-warning-soft); border-radius: var(--radius-md); font-size: 13px; color: #b45309">
          剩余可撤销时间: ${Math.ceil(remainMs / 1000 / 60)} 分钟
        </div>
      `}
    </div>
  `;
}

function timeSince(ts) {
  const elapsed = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
