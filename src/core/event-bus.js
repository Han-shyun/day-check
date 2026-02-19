export function createEventBus() {
  const map = new Map();
  return {
    on(event, handler) {
      const handlers = map.get(event) || new Set();
      handlers.add(handler);
      map.set(event, handlers);
      return () => handlers.delete(handler);
    },
    emit(event, payload) {
      const handlers = map.get(event);
      if (!handlers) {
        return;
      }
      handlers.forEach((handler) => handler(payload));
    },
  };
}
