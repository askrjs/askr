import type { ComponentInstance } from './component';
import { getCurrentComponentInstance } from './component';

const deriveCaches = new WeakMap<ComponentInstance, Map<unknown, unknown>>();

function getDeriveCache(instance: ComponentInstance): Map<unknown, unknown> {
  let cache = deriveCaches.get(instance);
  if (!cache) {
    cache = new Map();
    deriveCaches.set(instance, cache);
  }
  return cache;
}

// Short-form overload: accept a single function that returns the derived value
export function derive<TOut>(fn: () => TOut): TOut | null;

// Normal-form overload: derive(source, map)
export function derive<TIn, TOut>(
  source:
    | { value: TIn | null; pending?: boolean; error?: Error | null }
    | TIn
    | (() => TIn),
  map: (value: TIn) => TOut
): TOut | null;

export function derive<TIn, TOut>(
  source:
    | { value: TIn | null; pending?: boolean; error?: Error | null }
    | TIn
    | (() => TIn),
  map?: (value: TIn) => TOut
): TOut | null {
  // Short-form: derive(() => someExpression)
  if (map === undefined && typeof source === 'function') {
    const value = (source as () => TOut)();
    if (value == null) return null;

    const instance = getCurrentComponentInstance();
    if (!instance) {
      return value as TOut;
    }

    const cache = getDeriveCache(instance);
    if (cache.has(value as unknown)) return cache.get(value as unknown) as TOut;

    cache.set(value as unknown, value as unknown);
    return value as TOut;
  }

  // Normal form: derive(source, map)
  // Extract the actual value
  let value: TIn;
  if (typeof source === 'function' && !('value' in source)) {
    // It's a function (not a binding object with value property)
    value = (source as () => TIn)();
  } else {
    value = (source as { value?: TIn | null })?.value ?? (source as TIn);
  }
  if (value == null) return null;

  // Get or create memoization cache for this component
  const instance = getCurrentComponentInstance();
  if (!instance) {
    // No component context - just compute eagerly
    return (map as (v: TIn) => TOut)(value as TIn);
  }

  const cache = getDeriveCache(instance);

  // Check if we already have a cached result for this source value
  if (cache.has(value as unknown)) {
    return cache.get(value as unknown) as TOut;
  }

  // Compute and cache the result
  const result = (map as (v: TIn) => TOut)(value as TIn);
  cache.set(value as unknown, result as unknown);
  return result;
}
