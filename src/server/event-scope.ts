import { AsyncLocalStorage } from "node:async_hooks";

// Scope lives in the request's asynchronous context, never in a global variable.
export const eventScope = new AsyncLocalStorage<{
  eventId: string;
  role: "admin" | "gate_officer";
}>();
export const currentEventId = () => eventScope.getStore()?.eventId;

const locks = new Map<string, Promise<unknown>>();
export async function withEventLock<T>(
  key: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(action);
  locks.set(key, task);
  try {
    return await task;
  } finally {
    if (locks.get(key) === task) locks.delete(key);
  }
}
