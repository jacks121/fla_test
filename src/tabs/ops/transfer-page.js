// 转移（换皿）页面

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { iconCheck } from '../../lib/icons.js';

export function renderTransferPage(container, ctx) {
  const { store, api, refreshData, goBack, prefill } = ctx;
  const state = store.getState();
  const dishes = state.dishes || [];

  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card__sub">将花苗从旧培养皿转移到新培养皿（换皿操作）</div>
      </div>

      <div class="card">
        <div class="form-group">
          ${renderScanInput('transfer-old', '如 D-1', { label: '旧培养皿 ID' })}
          ${dishes.length > 0 ? `<div class="quick-btns">${dishes.slice(0, 6).map((d) => `<button type="button" class="quick-btn" data-old="${d.id}">${d.id}</button>`).join('')}</div>` : ''}
        </div>

        <div id="transfer-plant-info"></div>

        <div class="form-group">
          ${renderScanInput('transfer-new', '如 ND-1', { label: '新培养皿 ID' })}
          <button type="button" class="btn-ghost btn-sm" id="transfer-auto-id" style="margin-top: 6px; width: 100%">自动生成新皿 ID</button>
        </div>
      </div>
    </div>

    <div class="action-bar">
      <button class="btn-primary" id="transfer-submit">确认转移</button>
    </div>
  `;

  wireScanInputs(container);

  const oldInput = container.querySelector('#transfer-old');
  const newInput = container.querySelector('#transfer-new');
  const plantInfoEl = container.querySelector('#transfer-plant-info');
  const submitBtn = container.querySelector('#transfer-submit');

  // 预填
  if (prefill?.fromDishId) {
    oldInput.value = prefill.fromDishId;
    showPlantInfo(prefill.fromDishId, dishes, plantInfoEl);
  }

  oldInput.addEventListener('change', () => {
    showPlantInfo(oldInput.value.trim(), dishes, plantInfoEl);
  });

  container.querySelectorAll('[data-old]').forEach((btn) => {
    btn.addEventListener('click', () => {
      oldInput.value = btn.dataset.old;
      showPlantInfo(btn.dataset.old, dishes, plantInfoEl);
    });
  });

  container.querySelector('#transfer-auto-id')?.addEventListener('click', () => {
    newInput.value = `ND-${Math.floor(Math.random() * 900 + 100)}`;
  });

  submitBtn.addEventListener('click', () => {
    withSubmit(submitBtn, async () => {
      try {
        const fromDishId = oldInput.value.trim();
        const toDishId = newInput.value.trim();
        if (!fromDishId || !toDishId) throw new Error('请填写旧皿与新皿 ID');
        if (!dishes.find((d) => d.id === fromDishId)) throw new Error(`旧培养皿不存在: ${fromDishId}`);
        if (dishes.find((d) => d.id === toDishId)) throw new Error(`新培养皿已被占用: ${toDishId}`);

        await api.postEvent(
          {
            type: 'transfer',
            actorId: currentActorId(),
            payload: { fromDishId, toDishId },
          },
          getToken()
        );

        await refreshData();

        container.innerHTML = `
          <div class="page-content">
            <div class="card">
              <div class="result-page">
                <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
                <div class="result-page__title">转移完成</div>
                <div class="result-page__detail">${fromDishId} → ${toDishId}</div>
                <div class="result-page__actions">
                  <button class="btn-ghost" id="result-continue">继续转移</button>
                  <button class="btn-primary" id="result-done">完成</button>
                </div>
              </div>
            </div>
          </div>
        `;

        const actionBar = container.parentElement?.querySelector('.action-bar');
        if (actionBar) actionBar.style.display = 'none';

        container.querySelector('#result-continue')?.addEventListener('click', () => {
          renderTransferPage(container, ctx);
        });
        container.querySelector('#result-done')?.addEventListener('click', () => {
          if (goBack) goBack();
        });
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '转移失败', 'error');
      }
    });
  });
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
