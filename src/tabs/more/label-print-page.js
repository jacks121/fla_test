// 标签打印页面 — 生成二维码标签

import QRCode from 'qrcode';
import { toast } from '../../components/toast.js';

const PREFIX_MAP = { dish: 'D-', tray: 'T-', location: 'rack-' };

export function renderLabelPrintPage(container) {
  container.innerHTML = `
    <div class="page-content">
      <div class="card">
        <div class="card__sub">选择标签类型和范围，批量生成二维码标签</div>
      </div>

      <div class="card">
        <div class="form-group">
          <label for="qr-type">标签类型</label>
          <select id="qr-type">
            <option value="dish">培养皿 (D-)</option>
            <option value="tray">盘子 (T-)</option>
            <option value="location">位置 (rack-)</option>
            <option value="custom">自定义前缀</option>
          </select>
        </div>

        <div class="form-group hidden" id="custom-prefix-group">
          <label for="qr-prefix">自定义前缀</label>
          <input id="qr-prefix" placeholder="如 MY-" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="qr-start">起始编号</label>
            <input id="qr-start" type="number" inputmode="numeric" min="1" value="1" />
          </div>
          <div class="form-group">
            <label for="qr-count">数量</label>
            <input id="qr-count" type="number" inputmode="numeric" min="1" max="200" value="20" />
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 12px">
        <button class="btn-primary" id="qr-generate" style="flex: 1">生成标签</button>
        <button class="btn-success hidden" id="qr-print" style="flex: 1">打印标签</button>
      </div>

      <div id="qr-grid" class="qr-grid"></div>
    </div>
  `;

  const typeSelect = container.querySelector('#qr-type');
  const customGroup = container.querySelector('#custom-prefix-group');
  const prefixInput = container.querySelector('#qr-prefix');
  const startInput = container.querySelector('#qr-start');
  const countInput = container.querySelector('#qr-count');
  const generateBtn = container.querySelector('#qr-generate');
  const printBtn = container.querySelector('#qr-print');
  const grid = container.querySelector('#qr-grid');

  typeSelect.addEventListener('change', () => {
    customGroup.classList.toggle('hidden', typeSelect.value !== 'custom');
  });

  generateBtn.addEventListener('click', async () => {
    const type = typeSelect.value;
    const prefix = type === 'custom' ? (prefixInput.value || 'X-') : PREFIX_MAP[type];
    const start = Math.max(1, Number(startInput.value) || 1);
    const count = Math.min(200, Math.max(1, Number(countInput.value) || 20));

    grid.innerHTML = '';
    printBtn.classList.add('hidden');
    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';

    try {
      const ids = [];
      for (let i = 0; i < count; i++) {
        ids.push(`${prefix}${start + i}`);
      }

      for (const id of ids) {
        const cell = document.createElement('div');
        cell.className = 'qr-cell';
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, id, { width: 120, margin: 1 });
        cell.appendChild(canvas);
        const label = document.createElement('div');
        label.className = 'qr-label';
        label.textContent = id;
        cell.appendChild(label);
        grid.appendChild(cell);
      }

      printBtn.classList.remove('hidden');
      toast(`已生成 ${count} 个标签`, 'success');
    } catch (err) {
      toast('生成失败: ' + err.message, 'error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '生成标签';
    }
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });
}
