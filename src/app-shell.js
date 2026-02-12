// AppShell — 顶层壳：Header、TabBar 切换、离线检测、路由分发

import {
  iconHome, iconScan, iconClipboard, iconClock, iconMore
} from './lib/icons.js';
import { renderOverviewTab } from './tabs/overview-tab.js';
import { renderScanTab } from './tabs/scan-tab.js';
import { renderOpsTab, destroyOpsTab } from './tabs/ops-tab.js';
import { renderHistoryTab } from './tabs/history-tab.js';
import { renderMoreTab } from './tabs/more-tab.js';
import { getUser } from './lib/auth.js';
import { escapeHtml } from './lib/escape.js';

const TABS = [
  { id: 'overview', label: '总览', icon: iconHome },
  { id: 'scan', label: '扫码', icon: iconScan, isScan: true },
  { id: 'ops', label: '操作', icon: iconClipboard },
  { id: 'history', label: '历史', icon: iconClock },
  { id: 'more', label: '更多', icon: iconMore },
];

const TAB_RENDERERS = {
  overview: renderOverviewTab,
  scan: renderScanTab,
  ops: renderOpsTab,
  history: renderHistoryTab,
  more: renderMoreTab,
};

export function createAppShell({ store, bus, api, refreshData, mode }) {
  let activeTab = 'overview';
  const ctx = { store, bus, api, refreshData, mode };

  function render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    const user = getUser();

    appEl.innerHTML = `
      <div id="offline-banner" class="offline-banner">离线中 · 请检查网络连接</div>

      <div class="app-bar">
        <div class="app-bar__left">
          <span class="app-bar__title">花苗流程</span>${mode === 'local' ? '<span class="mode-badge">本地模式</span>' : ''}
        </div>
        <div class="app-bar__right">
          ${user?.name ? `<span class="app-bar__user">${escapeHtml(user.name)}</span>` : ''}
        </div>
      </div>

      <main id="content"></main>

      <nav class="tab-bar" role="tablist">
        ${TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const scanClass = tab.isScan ? ' tab-bar__item--scan' : '';
          return `
            <button class="tab-bar__item${isActive ? ' tab-bar__item--active' : ''}${scanClass}"
                    data-tab="${tab.id}" role="tab" aria-selected="${isActive}">
              ${tab.isScan
                ? `<span class="tab-bar__icon-wrap">${tab.icon({ size: 20 })}</span>`
                : `<span class="tab-bar__icon">${tab.icon({ size: 22 })}</span>`
              }
              <span class="tab-bar__label">${tab.label}</span>
            </button>
          `;
        }).join('')}
      </nav>
    `;

    wireTabBar();
    switchTab(activeTab);
    updateOfflineState();
  }

  function wireTabBar() {
    const appEl = document.getElementById('app');
    appEl.querySelectorAll('.tab-bar__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });
  }

  function switchTab(tabId) {
    activeTab = tabId;
    const content = document.getElementById('content');
    if (!content) return;

    // 更新 tab-bar 状态
    document.querySelectorAll('.tab-bar__item').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('tab-bar__item--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    // 清理旧 tab
    destroyOpsTab();

    // 移除旧 action-bar
    const oldActionBar = document.querySelector('.action-bar');
    if (oldActionBar) oldActionBar.remove();

    // 渲染新 tab
    content.innerHTML = '';
    const renderer = TAB_RENDERERS[tabId];
    if (renderer) {
      renderer(content, ctx);
    }
  }

  function updateOfflineState() {
    const banner = document.getElementById('offline-banner');
    if (banner) {
      banner.classList.toggle('offline-banner--show', !navigator.onLine);
    }
  }

  // 监听来自其他组件的 tab 切换请求
  bus.on('tab:switch', ({ tab }) => {
    switchTab(tab);
  });

  // 离线/在线
  window.addEventListener('online', async () => {
    updateOfflineState();
    try {
      await refreshData();
      switchTab(activeTab);
    } catch {
      // 静默处理
    }
  });
  window.addEventListener('offline', updateOfflineState);

  // Store 变化时刷新当前 tab
  store.subscribe(() => {
    // 仅在总览和历史 tab 时自动刷新
    if (activeTab === 'overview' || activeTab === 'history') {
      const content = document.getElementById('content');
      if (content) {
        const renderer = TAB_RENDERERS[activeTab];
        if (renderer) renderer(content, ctx);
      }
    }
  });

  return { render, switchTab };
}
