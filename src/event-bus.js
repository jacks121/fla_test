// 事件总线 — 组件间通信

export function createEventBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    emit(event, data) {
      handlers.get(event)?.forEach((fn) => fn(data));
    },
  };
}
