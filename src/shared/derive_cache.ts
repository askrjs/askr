// Centralized memoization cache for derive()
// Maps (component_instance) -> Map<source_value, result>
const deriveCacheMap = new WeakMap<{ id: string }, Map<unknown, unknown>>();

export function getDeriveCache(instance: {
  id: string;
}): Map<unknown, unknown> {
  let cache = deriveCacheMap.get(instance);
  if (!cache) {
    cache = new Map();
    deriveCacheMap.set(instance, cache);
  }
  return cache;
}
