// login.js — 登录页逻辑

import { setToken, setUser } from './lib/auth.js';
import { detectMode } from './lib/mode.js';

// 本地模式：跳过登录，直接进入
const mode = detectMode();
if (mode === 'local') {
  setToken('local-token');
  setUser({ id: 'local-user', name: '本地用户', role: 'admin' });
  const nextUrl = new URL('./index.html', window.location.href);
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode')) nextUrl.searchParams.set('mode', params.get('mode'));
  window.location.href = nextUrl.toString();
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const btn = form.querySelector('button[type="submit"]');

  if (!user || !pass) {
    errorEl.textContent = '请输入账号与口令';
    return;
  }

  btn.disabled = true;
  btn.textContent = '登录中...';
  errorEl.textContent = '';

  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get('api') || '';

  fetch(`${apiBase}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error('登录尝试过于频繁，请 1 分钟后再试');
        }
        throw new Error(data.error || '登录失败');
      }
      return res.json();
    })
    .then((data) => {
      setToken(data.token);
      setUser(data.user || { name: user });
      const nextUrl = new URL('./index.html', window.location.href);
      if (params.get('api')) nextUrl.searchParams.set('api', params.get('api'));
      window.location.href = nextUrl.toString();
    })
    .catch((err) => {
      errorEl.textContent = err.message || '登录失败';
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = '登录';
    });
});
