export function createApi(baseUrl = '', fetchImpl = fetch) {
  const normalizedBase = baseUrl.replace(/\/$/, '');

  async function request(path, options = {}, token) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${normalizedBase}${path}`, {
      ...options,
      headers,
    });
    if (!res.ok) {
      let err = {};
      try {
        err = await res.json();
      } catch {
        err = {};
      }
      const error = new Error(err.error || '请求失败');
      error.status = res.status;
      throw error;
    }
    return res.json();
  }

  function withQuery(path, params) {
    if (!params) return path;
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
    );
    const qs = query.toString();
    return qs ? `${path}?${qs}` : path;
  }

  return {
    login({ username, password }) {
      return request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },
    getMeta(token) {
      return request('/api/meta', {}, token);
    },
    getDishes(query, token) {
      return request(withQuery('/api/dishes', { query }), {}, token);
    },
    getEvents(params, token) {
      return request(withQuery('/api/events', params), {}, token);
    },
    postEvent(body, token) {
      return request('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, token);
    },
    undo(token) {
      return request('/api/events/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, token);
    },
    logout(token) {
      return request('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, token);
    },
  };
}
