// 上架页面 — 两阶段：锁定位置 → 添加盘子

import { renderScanInput, wireScanInputs } from '../../components/scan-input.js';
import { renderChipQueue, updateChipQueue } from '../../components/chip-queue.js';
import { toast } from '../../components/toast.js';
import { withSubmit } from '../../lib/submit.js';
import { getToken, currentActorId, handleAuthError } from '../../lib/auth.js';
import { startContinuousScan } from '../../lib/scanner.js';
import { iconCheck, iconScan, iconShelf } from '../../lib/icons.js';

export function renderPlacePage(container, ctx) {
  const { store, api, refreshData, goBack, prefill } = ctx;
  const state = store.getState();
  const locations = state.meta?.locations || [];
  const trays = state.meta?.trays || [];

  let lockedLocation = prefill?.locationId || '';
  let trayList = [];

  if (prefill?.trayId) trayList.push(prefill.trayId);

  if (lockedLocation) {
    renderTrayPhase();
  } else {
    renderLocationPhase();
  }

  function renderLocationPhase() {
    container.innerHTML = `
      <div class="page-content">
        <div class="card">
          <div style="text-align: center; padding: 12px 0">
            <div style="margin: 0 auto 12px; width: 48px; height: 48px; border-radius: 50%; background: var(--color-primary-soft); display: flex; align-items: center; justify-content: center; color: var(--color-primary)">
              ${iconShelf({ size: 22 })}
            </div>
            <div class="card__title">第一步：选择位置</div>
            <div class="card__sub">扫描或选择上架目标位置</div>
          </div>
        </div>

        <div class="card">
          <div class="form-group">
            ${renderScanInput('place-location', '如 rack-A1', { label: '上架位置' })}
            ${locations.length > 0 ? `<div class="quick-btns">${locations.map((l) => `<button type="button" class="quick-btn" data-loc="${l.id}">${l.label || l.id}</button>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn-primary" id="place-lock">锁定位置</button>
      </div>
    `;

    wireScanInputs(container);

    const locInput = container.querySelector('#place-location');
    container.querySelectorAll('[data-loc]').forEach((btn) => {
      btn.addEventListener('click', () => { locInput.value = btn.dataset.loc; });
    });

    container.querySelector('#place-lock')?.addEventListener('click', () => {
      const loc = locInput.value.trim();
      if (!loc) {
        toast('请先选择或输入位置', 'error');
        return;
      }
      lockedLocation = loc;
      renderTrayPhase();
    });
  }

  function renderTrayPhase() {
    container.innerHTML = `
      <div class="page-content">
        <div class="card" style="padding: 10px 16px">
          <div style="display: flex; align-items: center; justify-content: space-between">
            <div style="display: flex; align-items: center; gap: 8px">
              <span class="chip chip--location">位置: ${lockedLocation}</span>
            </div>
            <button type="button" class="btn-ghost btn-sm" id="place-change-loc">更换位置</button>
          </div>
        </div>

        <div class="card">
          <label>添加盘子（逐一扫码或输入）</label>
          <div style="display: flex; gap: 8px; margin-bottom: 8px">
            <input id="place-tray" placeholder="盘子编号" style="flex: 1" />
            <button type="button" class="btn-ghost btn-sm" id="place-tray-add">添加</button>
            <button type="button" class="btn-ghost btn-sm" id="place-tray-scan" style="color: var(--color-primary)">
              ${iconScan({ size: 16 })} 连扫
            </button>
          </div>
          ${trays.length > 0 ? `<div class="quick-btns" style="margin-bottom: 8px">${trays.map((t) => `<button type="button" class="quick-btn" data-tray="${t.id}">${t.id}</button>`).join('')}</div>` : ''}

          <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px">
            已添加 <strong id="place-tray-count">${trayList.length}</strong> 个盘子
          </div>
          ${renderChipQueue('place-queue')}
        </div>
      </div>

      <div class="action-bar">
        <button class="btn-primary" id="place-submit">完成上架</button>
      </div>
    `;

    const trayInput = container.querySelector('#place-tray');
    const countEl = container.querySelector('#place-tray-count');
    const submitBtn = container.querySelector('#place-submit');

    function refreshQueue() {
      countEl.textContent = trayList.length;
      updateChipQueue('place-queue', trayList, (id) => {
        trayList = trayList.filter((x) => x !== id);
        refreshQueue();
      });
    }
    refreshQueue();

    function addTray(id) {
      if (!id) return;
      if (trayList.includes(id)) {
        toast(`${id} 已在队列中`, 'warning');
        return;
      }
      trayList.push(id);
      refreshQueue();
    }

    container.querySelector('#place-change-loc')?.addEventListener('click', () => {
      lockedLocation = '';
      renderLocationPhase();
    });

    container.querySelector('#place-tray-add')?.addEventListener('click', () => {
      addTray(trayInput.value.trim());
      trayInput.value = '';
      trayInput.focus();
    });

    trayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTray(trayInput.value.trim());
        trayInput.value = '';
        trayInput.focus();
      }
    });

    container.querySelectorAll('[data-tray]').forEach((btn) => {
      btn.addEventListener('click', () => addTray(btn.dataset.tray));
    });

    container.querySelector('#place-tray-scan')?.addEventListener('click', () => {
      const seen = new Set(trayList);
      startContinuousScan(
        (text) => addTray(text),
        { seen, onDuplicate: (text) => toast(`${text} 已在队列`, 'warning') }
      );
    });

    submitBtn.addEventListener('click', () => {
      withSubmit(submitBtn, async () => {
        if (trayList.length === 0) {
          toast('请至少添加一个盘子', 'error');
          return;
        }
        try {
          for (const trayId of trayList) {
            await api.postEvent(
              {
                type: 'place',
                actorId: currentActorId(),
                payload: { trayId, locationId: lockedLocation },
              },
              getToken()
            );
          }

          toast(`已上架 ${trayList.length} 个盘子 @ ${lockedLocation}`, 'success');
          await refreshData();

          const prevCount = trayList.length;
          trayList = [];

          container.innerHTML = `
            <div class="page-content">
              <div class="card">
                <div class="result-page">
                  <div class="result-page__icon">${iconCheck({ size: 28 })}</div>
                  <div class="result-page__title">上架完成</div>
                  <div class="result-page__detail">${prevCount} 个盘子 → ${lockedLocation}</div>
                  <div class="result-page__actions">
                    <button class="btn-ghost" id="result-same">继续上架(同位置)</button>
                    <button class="btn-primary" id="result-change">换位置上架</button>
                  </div>
                </div>
              </div>
            </div>
          `;

          const actionBar = container.parentElement?.querySelector('.action-bar');
          if (actionBar) actionBar.style.display = 'none';

          container.querySelector('#result-same')?.addEventListener('click', () => {
            renderTrayPhase();
          });
          container.querySelector('#result-change')?.addEventListener('click', () => {
            lockedLocation = '';
            renderLocationPhase();
          });
        } catch (err) {
          if (handleAuthError(err)) return;
          toast(err.message || '上架失败', 'error');
        }
      });
    });
  }
}
