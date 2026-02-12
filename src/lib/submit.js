// 提交防抖封装 — 统一处理提交中状态

import { toast } from '../components/toast.js';

export async function withSubmit(btn, fn) {
  if (!navigator.onLine) {
    toast('当前离线，无法提交', 'error');
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '提交中...';
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
