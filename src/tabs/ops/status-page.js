// 状态更新页面 — 单皿更新 + 批量巡检模式

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { STATUS_COLORS } from '../../lib/constants.js';
import { startContinuousScan } from '../../lib/scanner.js';
import { iconCheck, iconScan } from '../../lib/icons.js';

export function renderStatusPage(container, ctx) {
  const { store, api, refreshData, prefill } = ctx;
  const state = store.getState();
  const dishes = state.dishes || [];
  const statusList = state.meta?.statusEnum?.length ? state.meta.statusEnum : ['正常', '感染', '变异'];

  let isBatchMode = false;
  let batchResults = [];

  renderSingleMode();

  function renderSingleMode() {
    isBatchMode = false;
    container.innerHTML = `
      <div class="page-content">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div class="card__sub">扫描或输入培养皿，选择新状态</div>
            <button type="button" class="btn-ghost btn-sm" id="status-batch-toggle">批量巡检</button>
          </div>
        </div>

        <div class="card">
          <div class="form-group">
            ${renderScanInput('status-dish', '如 D-1', { label: '培养皿 ID' })}
            ${dishes.length > 0 ? `<div class="quick-btns">${dishes.slice(0, 6).map((d) => `<button type="button" class="quick-btn" data-dish="${d.id}">${d.id}</button>`).join('')}</div>` : ''}
          </div>

          <div id="status-plant-info"></div>

          <div class="form-group">
            <label>状态</label>
            <div style="display: flex; gap: 8px">
              ${statusList.map((s) => {
                const colorClass = STATUS_COLORS[s] || 'primary';
                return `<button type="button" class="quick-btn status-btn" data-status="${s}" style="flex: 1; text-align: center">${s}</button>`;
              }).join('')}
            </div>
            <input type="hidden" id="status-value" value="${statusList[0]}" />
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn-primary" id="status-submit">更新状态</button>
      </div>
    `;

    wireScanInputs(container);

    const dishInput = container.querySelector('#status-dish');
    const statusValue = container.querySelector('#status-value');
    const plantInfoEl = container.querySelector('#status-plant-info');
    const submitBtn = container.querySelector('#status-submit');
    const statusBtns = container.querySelectorAll('.status-btn');

    // 默认选中第一个
    statusBtns[0]?.classList.add('quick-btn--active');

    statusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        statusBtns.forEach((b) => b.classList.remove('quick-btn--active'));
        btn.classList.add('quick-btn--active');
        statusValue.value = btn.dataset.status;
      });
    });

    // 预填
    if (prefill?.dishId) {
      dishInput.value = prefill.dishId;
      showPlantInfo(prefill.dishId, dishes, plantInfoEl);
    }

    dishInput.addEventListener('change', () => {
      showPlantInfo(dishInput.value.trim(), dishes, plantInfoEl);
    });

    container.querySelectorAll('[data-dish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dishInput.value = btn.dataset.dish;
        showPlantInfo(btn.dataset.dish, dishes, plantInfoEl);
      });
    });

    container.querySelector('#status-batch-toggle')?.addEventListener('click', () => {
      renderBatchMode();
    });

    submitBtn.addEventListener('click', () => {
      withSubmit(submitBtn, async () => {
        try {
          const dishId = dishInput.value.trim();
          if (!dishId) throw new Error('请填写培养皿 ID');
          const status = statusValue.value;

          await api.postEvent(
            {
              type: 'status',
              actorId: currentActorId(),
              payload: { dishId, status },
            },
            getToken()
          );

          toast('状态已更新', 'success');
          dishInput.value = '';
          plantInfoEl.innerHTML = '';
          await refreshData();
        } catch (err) {
          if (handleAuthError(err)) return;
          toast(err.message || '更新失败', 'error');
        }
      });
    });
  }

  function renderBatchMode() {
    isBatchMode = true;
    batchResults = [];

    container.innerHTML = `
      <div class="page-content">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <div>
              <div class="card__title">批量巡检模式</div>
              <div class="card__sub">连续扫码，自动以默认状态记录</div>
            </div>
            <button type="button" class="btn-ghost btn-sm" id="batch-exit">退出批量</button>
          </div>
        </div>

        <div class="card">
          <div class="form-group">
            <label>默认状态</label>
            <div style="display: flex; gap: 8px">
              ${statusList.map((s, i) => {
                return `<button type="button" class="quick-btn batch-status-btn ${i === 0 ? 'quick-btn--active' : ''}" data-status="${s}" style="flex: 1; text-align: center">${s}</button>`;
              }).join('')}
            </div>
            <input type="hidden" id="batch-default-status" value="${statusList[0]}" />
          </div>

          <button type="button" class="btn-primary" id="batch-scan-start" style="margin-bottom: 12px">
            ${iconScan({ size: 18 })} 开始连续扫码
          </button>

          <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px">
            已扫描 <strong id="batch-count">0</strong> 皿
          </div>

          <div id="batch-log" style="max-height: 300px; overflow-y: auto">
            <div class="event-item event-item--empty">开始扫码后将显示记录</div>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn-success" id="batch-confirm" disabled>确认提交全部</button>
      </div>
    `;

    const defaultStatusInput = container.querySelector('#batch-default-status');
    const batchStatusBtns = container.querySelectorAll('.batch-status-btn');
    const countEl = container.querySelector('#batch-count');
    const logEl = container.querySelector('#batch-log');
    const confirmBtn = container.querySelector('#batch-confirm');

    batchStatusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        batchStatusBtns.forEach((b) => b.classList.remove('quick-btn--active'));
        btn.classList.add('quick-btn--active');
        defaultStatusInput.value = btn.dataset.status;
      });
    });

    container.querySelector('#batch-exit')?.addEventListener('click', () => {
      renderSingleMode();
    });

    container.querySelector('#batch-scan-start')?.addEventListener('click', () => {
      const seen = new Set();
      startContinuousScan(
        async (text) => {
          const status = defaultStatusInput.value;
          batchResults.push({ dishId: text, status });
          countEl.textContent = batchResults.length;
          confirmBtn.disabled = false;

          // 立即提交单条
          try {
            await api.postEvent(
              {
                type: 'status',
                actorId: currentActorId(),
                payload: { dishId: text, status },
              },
              getToken()
            );
            addBatchLogEntry(logEl, text, status, true);
            toast(`${text} → ${status}`, 'success', 1000);
          } catch (err) {
            addBatchLogEntry(logEl, text, status, false, err.message);
            toast(`${text} 失败: ${err.message}`, 'error');
          }
        },
        {
          seen,
          onDuplicate: (text) => toast(`${text} 已扫描`, 'warning'),
        }
      );
    });

    confirmBtn.addEventListener('click', async () => {
      await refreshData();
      const counts = {};
      batchResults.forEach((r) => {
        counts[r.status] = (counts[r.status] || 0) + 1;
      });
      const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('  ');

      container.innerHTML = `
        <div class="page-content">
          <div class="card">
            <div class="result-page">
              <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
              <div class="result-page__title">巡检完成</div>
              <div class="result-page__detail">
                共处理 ${batchResults.length} 皿<br>
                ${summary}
              </div>
              <div class="result-page__actions">
                <button class="btn-ghost" id="batch-again">继续巡检</button>
                <button class="btn-primary" id="batch-done">完成</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const actionBar = container.parentElement?.querySelector('.action-bar');
      if (actionBar) actionBar.style.display = 'none';

      container.querySelector('#batch-again')?.addEventListener('click', () => renderBatchMode());
      container.querySelector('#batch-done')?.addEventListener('click', () => renderSingleMode());
    });
  }
}

function addBatchLogEntry(logEl, dishId, status, success, error) {
  // 移除空状态
  const empty = logEl.querySelector('.event-item--empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--color-border-light); font-size: 13px;';
  const statusBadge = success
    ? `<span class="badge badge--${STATUS_COLORS[status] || 'primary'}">${status}</span>`
    : `<span class="badge badge--danger">失败</span>`;
  entry.innerHTML = `
    <span style="font-weight: 500">${dishId}</span>
    ${statusBadge}
  `;
  logEl.prepend(entry);
}

function showPlantInfo(dishId, dishes, el) {
  if (!dishId || !el) return;
  const dish = dishes.find((d) => d.id === dishId);
  if (!dish) {
    el.innerHTML = `<div style="padding: 8px 12px; background: var(--color-danger-soft); border-radius: var(--radius-md); font-size: 13px; color: var(--color-danger); margin: 8px 0">未找到培养皿 ${dishId}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="plant-info-card">
      <div class="plant-info-card__field">
        <span class="plant-info-card__label">培养皿</span>
        <span class="plant-info-card__value">${dish.id}</span>
      </div>
      <div class="plant-info-card__field">
        <span class="plant-info-card__label">花苗</span>
        <span class="plant-info-card__value">${dish.plantId || '-'}</span>
      </div>
    </div>
  `;
}
