// 拆分页面

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { iconCheck } from '../../lib/icons.js';

export function renderSplitPage(container, ctx) {
  const { store, api, refreshData, goBack, prefill } = ctx;
  const state = store.getState();
  const dishes = state.dishes || [];
  const trays = state.meta?.trays || [];

  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card__sub">从一个父培养皿拆分出多个子代，子代继承父代品种和阶段</div>
      </div>

      <div class="card">
        <div class="form-group">
          ${renderScanInput('split-parent', '如 D-1', { label: '父培养皿 ID' })}
          ${dishes.length > 0 ? `<div class="quick-btns">${dishes.slice(0, 6).map((d) => `<button type="button" class="quick-btn" data-dish="${d.id}">${d.id}</button>`).join('')}</div>` : ''}
        </div>

        <div id="split-plant-info"></div>

        <div class="form-group">
          ${renderScanInput('split-tray', '如 T-01', { label: '盘子编号' })}
          ${trays.length > 0 ? `<div class="quick-btns">${trays.map((t) => `<button type="button" class="quick-btn" data-tray="${t.id}">${t.id}</button>`).join('')}</div>` : ''}
        </div>

        <div class="form-group">
          <label>拆分数量</label>
          <div class="number-stepper">
            <button type="button" class="number-stepper__btn" id="split-dec">-</button>
            <input id="split-count" type="number" inputmode="numeric" min="1" max="50" value="3" />
            <button type="button" class="number-stepper__btn" id="split-inc">+</button>
          </div>
          <div class="quick-btns">
            ${[1, 3, 5, 10].map((n) => `<button type="button" class="quick-btn" data-count="${n}">${n}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="action-bar">
      <button class="btn-primary" id="split-submit">确认拆分</button>
    </div>
  `;

  wireScanInputs(container);

  const parentInput = container.querySelector('#split-parent');
  const trayInput = container.querySelector('#split-tray');
  const countInput = container.querySelector('#split-count');
  const submitBtn = container.querySelector('#split-submit');
  const plantInfoEl = container.querySelector('#split-plant-info');

  // 预填
  if (prefill?.parentDishId) {
    parentInput.value = prefill.parentDishId;
    showPlantInfo(parentInput.value, dishes, plantInfoEl);
  }

  // 父皿输入变化时显示信息
  parentInput.addEventListener('change', () => {
    showPlantInfo(parentInput.value.trim(), dishes, plantInfoEl);
  });

  // 快捷
  container.querySelectorAll('[data-dish]').forEach((btn) => {
    btn.addEventListener('click', () => {
      parentInput.value = btn.dataset.dish;
      showPlantInfo(btn.dataset.dish, dishes, plantInfoEl);
    });
  });
  container.querySelectorAll('[data-tray]').forEach((btn) => {
    btn.addEventListener('click', () => { trayInput.value = btn.dataset.tray; });
  });
  container.querySelectorAll('[data-count]').forEach((btn) => {
    btn.addEventListener('click', () => {
      countInput.value = btn.dataset.count;
      container.querySelectorAll('[data-count]').forEach((b) => b.classList.remove('quick-btn--active'));
      btn.classList.add('quick-btn--active');
    });
  });

  // 步进
  container.querySelector('#split-dec')?.addEventListener('click', () => {
    countInput.value = Math.max(1, Number(countInput.value) - 1);
  });
  container.querySelector('#split-inc')?.addEventListener('click', () => {
    countInput.value = Math.min(50, Number(countInput.value) + 1);
  });

  // 提交
  submitBtn.addEventListener('click', () => {
    withSubmit(submitBtn, async () => {
      try {
        const parentDishId = parentInput.value.trim();
        if (!parentDishId) throw new Error('请填写父培养皿 ID');
        const trayId = trayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');
        const count = Number(countInput.value || '0');
        if (count < 1) throw new Error('数量需大于 0');

        const event = await api.postEvent(
          {
            type: 'split',
            actorId: currentActorId(),
            payload: { parentDishId, count, trayId },
          },
          getToken()
        );

        await refreshData();

        const outputIds = event.outputIds || [];
        container.innerHTML = `
          <div class="page-content">
            <div class="card">
              <div class="result-page">
                <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
                <div class="result-page__title">拆分成功</div>
                <div class="result-page__detail">
                  ${parentDishId} 拆分为 ${outputIds.length} 株子代<br>
                  ${outputIds.length > 0 ? outputIds.join(', ') : ''}
                </div>
                <div class="result-page__actions">
                  <button class="btn-ghost" id="result-continue">继续拆分</button>
                  <button class="btn-primary" id="result-place">去上架</button>
                </div>
              </div>
            </div>
          </div>
        `;

        const actionBar = container.parentElement?.querySelector('.action-bar');
        if (actionBar) actionBar.style.display = 'none';

        container.querySelector('#result-continue')?.addEventListener('click', () => {
          renderSplitPage(container, ctx);
        });
        container.querySelector('#result-place')?.addEventListener('click', () => {
          ctx.bus.emit('ops:navigate', { page: 'place', prefill: { trayId } });
        });
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '拆分失败', 'error');
      }
    });
  });
}

function showPlantInfo(dishId, dishes, el) {
  if (!dishId || !el) return;
  const dish = dishes.find((d) => d.id === dishId);
  if (!dish) {
    el.innerHTML = `<div class="card" style="border-color: var(--color-danger); background: var(--color-danger-soft); padding: 10px; font-size: 13px; color: var(--color-danger)">未找到培养皿 ${dishId}</div>`;
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
