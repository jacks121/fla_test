// 创建（入库）页面

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { iconCheck } from '../../lib/icons.js';

export function renderCreatePage(container, ctx) {
  const { store, api, refreshData, goBack, prefill } = ctx;
  const state = store.getState();
  const types = state.meta?.types || ['品种A', '品种B'];
  const stages = state.meta?.stages || ['萌发', '生长', '分化'];
  const trays = state.meta?.trays || [];

  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card__sub">选择品种和阶段，批量创建花苗和培养皿</div>
      </div>

      <div class="card">
        <div class="form-group">
          <label for="create-type">品种</label>
          <select id="create-type">
            ${types.map((t) => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="create-stage">阶段</label>
          <select id="create-stage">
            ${stages.map((s) => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>数量</label>
          <div class="number-stepper">
            <button type="button" class="number-stepper__btn" id="count-dec">-</button>
            <input id="create-count" type="number" inputmode="numeric" min="1" max="50" value="3" />
            <button type="button" class="number-stepper__btn" id="count-inc">+</button>
          </div>
          <div class="quick-btns">
            ${[1, 3, 5, 10].map((n) => `<button type="button" class="quick-btn" data-count="${n}">${n}</button>`).join('')}
          </div>
        </div>

        <div class="form-group">
          ${renderScanInput('create-tray', '如 T-01', { label: '盘子编号' })}
          ${trays.length > 0 ? `<div class="quick-btns">${trays.map((t) => `<button type="button" class="quick-btn" data-tray="${t.id}">${t.id}</button>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="action-bar">
      <button class="btn-primary" id="create-submit">确认创建</button>
    </div>
  `;

  wireScanInputs(container);

  const countInput = container.querySelector('#create-count');
  const trayInput = container.querySelector('#create-tray');
  const typeSelect = container.querySelector('#create-type');
  const stageSelect = container.querySelector('#create-stage');
  const submitBtn = container.querySelector('#create-submit');

  // 数量步进
  container.querySelector('#count-dec')?.addEventListener('click', () => {
    const v = Math.max(1, Number(countInput.value) - 1);
    countInput.value = v;
  });
  container.querySelector('#count-inc')?.addEventListener('click', () => {
    const v = Math.min(50, Number(countInput.value) + 1);
    countInput.value = v;
  });

  // 快捷数量
  container.querySelectorAll('[data-count]').forEach((btn) => {
    btn.addEventListener('click', () => {
      countInput.value = btn.dataset.count;
      container.querySelectorAll('[data-count]').forEach((b) => b.classList.remove('quick-btn--active'));
      btn.classList.add('quick-btn--active');
    });
  });

  // 快捷盘子
  container.querySelectorAll('[data-tray]').forEach((btn) => {
    btn.addEventListener('click', () => {
      trayInput.value = btn.dataset.tray;
    });
  });

  // 预填
  if (prefill?.trayId) trayInput.value = prefill.trayId;

  // 提交
  submitBtn.addEventListener('click', () => {
    withSubmit(submitBtn, async () => {
      try {
        const plantType = typeSelect.value;
        const stage = stageSelect.value;
        const count = Number(countInput.value || '0');
        if (count < 1) throw new Error('数量需大于 0');
        const trayId = trayInput.value.trim();
        if (!trayId) throw new Error('请填写盘子编号');

        const event = await api.postEvent(
          {
            type: 'create',
            actorId: currentActorId(),
            payload: { type: plantType, stage, count, trayId },
          },
          getToken()
        );

        await refreshData();

        // 成功结果页
        const outputIds = event.outputIds || [];
        showResultPage(container, {
          title: `成功创建 ${outputIds.length} 株花苗`,
          detail: outputIds.length > 0 ? `培养皿: ${outputIds.join(', ')}` : '',
          onContinue: () => renderCreatePage(container, ctx),
          onPlace: () => {
            ctx.bus.emit('ops:navigate', { page: 'place', prefill: { trayId } });
          },
          goBack,
        });
      } catch (err) {
        if (handleAuthError(err)) return;
        toast(err.message || '创建失败', 'error');
      }
    });
  });
}

function showResultPage(container, { title, detail, onContinue, onPlace, goBack }) {
  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="result-page">
          <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
          <div class="result-page__title">${title}</div>
          ${detail ? `<div class="result-page__detail">${detail}</div>` : ''}
          <div class="result-page__actions">
            <button class="btn-ghost" id="result-continue">继续创建</button>
            <button class="btn-primary" id="result-place">去上架</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // 移除 action-bar
  const actionBar = container.parentElement?.querySelector('.action-bar');
  if (actionBar) actionBar.style.display = 'none';

  container.querySelector('#result-continue')?.addEventListener('click', onContinue);
  container.querySelector('#result-place')?.addEventListener('click', onPlace);
}
