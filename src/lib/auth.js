// 认证工具 — token 读写、用户信息、clearAuth

const TOKEN_KEY = 'fla_token';
const USER_KEY = 'fla_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

export function currentActorId() {
  const user = getUser();
  return user?.id || user?.name || 'emp-01';
}

export function redirectToLogin() {
  const params = new URLSearchParams(window.location.search);
  const loginUrl = new URL('./login.html', window.location.href);
  if (params.get('api')) loginUrl.searchParams.set('api', params.get('api'));
  window.location.href = loginUrl.toString();
}

export function handleAuthError(err) {
  if (err?.status === 401) {
    clearAuth();
    redirectToLogin();
    return true;
  }
  return false;
}
