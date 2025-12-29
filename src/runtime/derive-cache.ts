import type { ComponentInstance } from './component';

const caches = new WeakMap<ComponentInstance, Map<unknown, unknown>>();

export function getDeriveCache(
  instance: ComponentInstance
): Map<unknown, unknown> {
  let cache = caches.get(instance);
  if (!cache) {
    cache = new Map();
    caches.set(instance, cache);
  }
  return cache;
}
