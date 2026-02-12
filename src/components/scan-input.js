// 扫码输入框组件 — 输入框 + 扫码按钮
// render 返回 HTML 字符串, wire 绑定事件

import { iconScan } from '../lib/icons.js';
import { startScan } from '../lib/scanner.js';

export function renderScanInput(id, placeholder, opts = {}) {
  const label = opts.label || '';
  const labelHtml = label ? `<label for="${id}">${label}</label>` : '';
  return `
    ${labelHtml}
    <div class="scan-input">
      <input id="${id}" placeholder="${placeholder}" autocomplete="off" />
      <button type="button" class="scan-input__btn" data-scan-target="${id}" aria-label="扫码">
        ${iconScan({ size: 18 })}
      </button>
    </div>
  `;
}

export function wireScanInputs(root) {
  root.querySelectorAll('.scan-input__btn[data-scan-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.scanTarget;
      const input = root.querySelector('#' + targetId);
      startScan((text) => {
        if (input) {
          input.value = text;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  });
}
