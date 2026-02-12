// 模式检测：构建时环境变量 > URL 参数 > localStorage 记忆 > 默认 server
const BUILD_MODE = import.meta.env.VITE_MODE || '';

export function detectMode() {
  // 1. 构建时硬编码（VITE_MODE=local npm run build:local）
  if (BUILD_MODE === 'local') return 'local';
  if (BUILD_MODE === 'server') return 'server';

  // 2. URL 参数覆盖
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  if (modeParam === 'local' || modeParam === 'server') {
    persistMode(modeParam);
    return modeParam;
  }

  // 3. localStorage 记忆
  const saved = localStorage.getItem('fla_mode');
  if (saved === 'local' || saved === 'server') return saved;

  // 4. 默认 server
  return 'server';
}

export function persistMode(mode) {
  localStorage.setItem('fla_mode', mode);
}

export function getMode() {
  return localStorage.getItem('fla_mode') || 'server';
}

export function isLocalMode() {
  return detectMode() === 'local';
}
