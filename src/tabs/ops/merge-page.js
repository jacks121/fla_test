// 合并页面

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { renderChipQueue, updateChipQueue } from '../../components/chip-queue.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { normalizeParentIds } from '../../lib/merge.js';
import { startContinuousScan } from '../../lib/scanner.js';
import { iconCheck, iconScan } from '../../lib/icons.js';

export function renderMergePage(container, ctx) {
  const { store, api, refreshData, goBack } = ctx;
  const state = store.getState();
  const trays = state.meta?.trays || [];
  const dishes = state.dishes || [];

  let parentQueue = [];

  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card__sub">将多个父培养皿中的花苗合并为一株</div>
      </div>

      <div class="card">
        <div class="form-group">
          ${renderScanInput('merge-tray', '如 T-02', { label: '合并后盘子编号' })}
          ${trays.length > 0 ? `<div class="quick-btns">${trays.map((t) => `<button type="button" class="quick-btn" data-tray="${t.id}">${t.id}</button>`).join('')}</div>` : ''}
        </div>

        <div class="form-group">
          ${renderScanInput('merge-target', '如 ND-101（可选）', { label: '新培养皿编号' })}
          <button type="button" class="btn-ghost btn-sm" id="merge-auto-id" style="margin-top: 6px; width: 100%">自动生成编号</button>
        </div>
      </div>

      <div class="card">
        <label>父培养皿队列</label>
        <div style="display: flex; gap: 8px; margin-bottom: 8px">
          <input id="merge-parent-input" placeholder="输入父皿ID，回车加入" style="flex: 1" />
          <button type="button" class="btn-ghost btn-sm" id="merge-add-btn">加入</button>
          <button type="button" class="btn-ghost btn-sm" id="merge-scan-btn" style="color: var(--color-primary)">
            ${iconScan({ size: 16 })} 连扫
          </button>
        </div>
        <input id="merge-bulk" placeholder="或粘贴逗号分隔列表" style="margin-bottom: 8px" />
        ${dishes.length > 0 ? `<div class="quick-btns" style="margin-bottom: 8px">${dishes.slice(0, 6).map((d) => `<button type="button" class="quick-btn" data-dish="${d.id}">${d.id}</button>`).join('')}</div>` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
          <span style="font-size: 12px; color: var(--color-text-secondary)">已添加 <strong id="merge-count">0</strong> 皿</span>
          <button type="button" class="btn-ghost btn-sm" id="merge-clear" style="font-size: 12px">清空</button>
        </div>
        ${renderChipQueue('merge-queue')}
      </div>
    </div>

    <div class="action-bar">
      <button class="btn-primary" id="merge-submit">确认合并</button>
    </div>
  `;

  wireScanInputs(container);

  const trayInput = container.querySelector('#merge-tray');
  const targetInput = container.querySelector('#merge-target');
  const parentInput = container.querySelector('#merge-parent-input');
  const bulkInput = container.querySelector('#merge-bulk');
  const countEl = container.querySelector('#merge-count');
  const submitBtn = container.querySelector('#merge-submit');

  function refreshQueue() {
    countEl.textContent = parentQueue.length;
    updateChipQueue('merge-queue', parentQueue, (id) => {
      parentQueue = parentQueue.filter((x) => x !== id);
      refreshQueue();
    });
  }

  function addParent(id) {
    if (!id) return;
    if (parentQueue.includes(id)) {
      toast(`${id} 已在队列中`, 'warning');
      return;
    }
    parentQueue.push(id);
    refreshQueue();
  }

  // 快捷盘子
  container.querySelectorAll('[data-tray]').forEach((btn) => {
    btn.addEventListener('click', () => { trayInput.value = btn.dataset.tray; });
  });

  // 快捷培养皿
  container.querySelectorAll('[data-dish]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addParent(btn.dataset.dish);
    });
  });

  // 自动生成
  container.querySelector('#merge-auto-id')?.addEventListener('click', () => {
    targetInput.value = `ND-${Math.floor(Math.random() * 900 + 100)}`;
  });

  // 加入
  container.querySelector('#merge-add-btn')?.addEventListener('click', () => {
    addParent(parentInput.value.trim());
    parentInput.value = '';
    parentInput.focus();
  });

  parentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParent(parentInput.value.trim());
      parentInput.value = '';
      parentInput.focus();
    }
  });

  // 连扫
  container.querySelector('#merge-scan-btn')?.addEventListener('click', () => {
    const seen = new Set(parentQueue);
    startContinuousScan(
      (text) => { addParent(text); },
      { seen, onDuplicate: (text) => toast(`${text} 已在队列中`, 'warning') }
    );
  });

  // 清空
  container.querySelector('#merge-clear')?.addEventListener('click', () => {
    parentQueue = [];
    bulkInput.value = '';
    refreshQueue();
  });

  refreshQueue();

  // 提交
  submitBtn.addEventListener('click', () => {
    withSubmit(submitBtn, async () => {
      try {
        const parents = normalizeParentIds(parentQueue, bulkInput.value);
        if (parents.length === 0) throw new Error('请添加至少一个父培养皿');
        const trayId = trayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');
        const targetDishId = targetInput.value.trim();

        if (targetDishId && parents.includes(targetDishId)) {
          throw new Error('新培养皿不能与父培养皿相同');
        }
        const occupied = new Set(dishes.map((d) => d.id));
        if (targetDishId && occupied.has(targetDishId)) {
          throw new Error(`培养皿已被占用: ${targetDishId}`);
        }

        await api.postEvent(
          {
            type: 'merge',
            actorId: currentActorId(),
            payload: { parentDishIds: parents, trayId, targetDishId },
          },
          getToken()
        );

        await refreshData();

        container.innerHTML = `
          <div class="page-content">
            <div class="card">
              <div class="result-page">
                <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
                <div class="result-page__title">合并成功</div>
                <div class="result-page__detail">
                  ${parents.length} 皿合并为 1 株<br>
                  父皿: ${parents.join(', ')}
                </div>
                <div class="result-page__actions">
                  <button class="btn-ghost" id="result-continue">继续合并</button>
                  <button class="btn-primary" id="result-place">去上架</button>
                </div>
              </div>
            </div>
          </div>
        `;

        const actionBar = container.parentElement?.querySelector('.action-bar');
        if (actionBar) actionBar.style.display = 'none';

        container.querySelector('#result-continue')?.addEventListener('click', () => {
          renderMergePage(container, ctx);
        });
        container.querySelector('#result-place')?.addEventListener('click', () => {
          ctx.bus.emit('ops:navigate', { page: 'place', prefill: { trayId } });
        });
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '合并失败', 'error');
      }
    });
  });
}
