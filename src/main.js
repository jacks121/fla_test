// main.js — 入口：初始化 store/bus/api，启动 AppShell

import { createApi } from './lib/api.js';
import { createLocalApi } from './lib/local-api.js';
import { createStore } from './store.js';
import { createEventBus } from './event-bus.js';
import { createAppShell } from './app-shell.js';
import { filterEventsByActor } from './lib/history.js';
import { getToken, isAuthenticated, setToken, setUser, currentActorId, handleAuthError, redirectToLogin } from './lib/auth.js';
import { toast } from './components/toast.js';
import { detectMode } from './lib/mode.js';

// 模式检测
const mode = detectMode();

// API 基础 URL
const url = new URL(window.location.href);
const apiBase = url.searchParams.get('api') || '';
const api = mode === 'local' ? createLocalApi() : createApi(apiBase);

// Store
const store = createStore({
  meta: { trays: [], locations: [], statusEnum: [] },
  dishes: [],
  events: [],
  myEvents: [],
});

// 事件总线
const bus = createEventBus();

// 数据加载
async function loadState() {
  const token = getToken();
  const [meta, dishes, events] = await Promise.all([
    api.getMeta(token),
    api.getDishes(undefined, token),
    api.getEvents(undefined, token),
  ]);
  store.setState({
    meta: meta || { trays: [], locations: [], statusEnum: [] },
    dishes: dishes || [],
    events: events || [],
    myEvents: filterEventsByActor(events || [], currentActorId()),
  });
}

async function refreshData() {
  const token = getToken();
  const [dishes, events] = await Promise.all([
    api.getDishes(undefined, token),
    api.getEvents(undefined, token),
  ]);
  store.setState({
    dishes: dishes || [],
    events: events || [],
    myEvents: filterEventsByActor(events || [], currentActorId()),
  });
}

// 启动
async function bootstrap() {
  if (mode === 'local' && !isAuthenticated()) {
    setToken('local-token');
    setUser({ id: 'local-user', name: '本地用户', role: 'admin' });
  }

  if (mode !== 'local' && !isAuthenticated()) {
    redirectToLogin();
    return;
  }

  const shell = createAppShell({ store, bus, api, refreshData, mode });

  // 先渲染壳，再加载数据
  shell.render();

  try {
    await loadState();
    // 数据加载后重新渲染当前 tab（store 变化会触发刷新）
  } catch (err) {
    if (!handleAuthError(err)) {
      toast('无法连接服务器', 'error');
    }
  }
}

bootstrap();
