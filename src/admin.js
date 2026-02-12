// admin.js — 标签打印页入口（独立页面版本）

import QRCode from 'qrcode';

const typeSelect = document.getElementById('qr-type');
const customPanel = document.getElementById('custom-prefix-panel');
const prefixInput = document.getElementById('qr-prefix');
const startInput = document.getElementById('qr-start');
const countInput = document.getElementById('qr-count');
const generateBtn = document.getElementById('qr-generate');
const printBtn = document.getElementById('qr-print');
const grid = document.getElementById('qr-grid');

const prefixMap = { dish: 'D-', tray: 'T-', location: 'rack-' };

typeSelect.addEventListener('change', () => {
  customPanel.classList.toggle('hidden', typeSelect.value !== 'custom');
});

generateBtn.addEventListener('click', async () => {
  const type = typeSelect.value;
  const prefix = type === 'custom' ? (prefixInput.value || 'X-') : prefixMap[type];
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
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '生成标签';
  }
});

printBtn.addEventListener('click', () => {
  window.print();
});
