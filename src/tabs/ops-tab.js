// 操作 Tab — 所有操作类型的入口 + 各操作子页面

import {
  iconPlus, iconSplit, iconMerge, iconShelf, iconStatus,
  iconTransfer, iconChevronRight, iconChevronLeft
} from '../lib/icons.js';
import { renderCreatePage } from './ops/create-page.js';
import { renderSplitPage } from './ops/split-page.js';
import { renderMergePage } from './ops/merge-page.js';
import { renderPlacePage } from './ops/place-page.js';
import { renderStatusPage } from './ops/status-page.js';
import { renderTransferPage } from './ops/transfer-page.js';

const OPS = [
  { id: 'create', title: '创建入库', desc: '批量创建花苗和培养皿', icon: iconPlus, accent: 'create' },
  { id: 'split', title: '拆分', desc: '从父培养皿拆分子代', icon: iconSplit, accent: 'split' },
  { id: 'merge', title: '合并', desc: '多皿合并为一株', icon: iconMerge, accent: 'merge' },
  { id: 'place', title: '上架', desc: '将盘子放置到货架位置', icon: iconShelf, accent: 'place' },
  { id: 'status', title: '状态更新', desc: '更新花苗健康状态', icon: iconStatus, accent: 'status' },
  { id: 'transfer', title: '转移换皿', desc: '将花苗转移到新培养皿', icon: iconTransfer, accent: 'transfer' },
];

const PAGE_RENDERERS = {
  create: renderCreatePage,
  split: renderSplitPage,
  merge: renderMergePage,
  place: renderPlacePage,
  status: renderStatusPage,
  transfer: renderTransferPage,
};

let currentSubPage = null;
let unsubNavigate = null;

export function renderOpsTab(container, ctx) {
  currentSubPage = null;
  renderOpsList(container, ctx);

  // 监听从其他地方来的导航请求
  if (unsubNavigate) unsubNavigate();
  unsubNavigate = ctx.bus.on('ops:navigate', ({ page, prefill }) => {
    navigateToPage(container, ctx, page, prefill);
  });
}

function renderOpsList(container, ctx) {
  currentSubPage = null;
  container.innerHTML = `
    <div class="page-content">
      <div class="section-title">选择操作</div>
      ${OPS.map((op) => `
        <div class="action-card" data-op="${op.id}">
          <div class="action-card__icon action-card__icon--${op.accent}">
            ${op.icon({ size: 20 })}
          </div>
          <div class="action-card__content">
            <div class="action-card__title">${op.title}</div>
            <div class="action-card__desc">${op.desc}</div>
          </div>
          <div class="action-card__arrow">${iconChevronRight({ size: 16 })}</div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.action-card[data-op]').forEach((card) => {
    card.addEventListener('click', () => {
      navigateToPage(container, ctx, card.dataset.op);
    });
  });
}

function navigateToPage(container, ctx, pageId, prefill) {
  const renderer = PAGE_RENDERERS[pageId];
  if (!renderer) return;

  const op = OPS.find((o) => o.id === pageId);
  currentSubPage = pageId;

  container.innerHTML = `
    <div class="sub-header">
      <button class="sub-header__back" id="ops-back" aria-label="返回">
        ${iconChevronLeft({ size: 20 })}
      </button>
      <div class="sub-header__title">${op?.title || pageId}</div>
    </div>
    <div id="ops-page-content"></div>
  `;

  container.querySelector('#ops-back')?.addEventListener('click', () => {
    renderOpsList(container, ctx);
  });

  const pageContainer = container.querySelector('#ops-page-content');
  renderer(pageContainer, { ...ctx, prefill, goBack: () => renderOpsList(container, ctx) });
}

export function destroyOpsTab() {
  if (unsubNavigate) {
    unsubNavigate();
    unsubNavigate = null;
  }
}
