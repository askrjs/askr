/**
 * mergeProps
 *
 * Deterministic props merging. Human-provided props (base) take precedence,
 * but event handlers are composed so that injected hooks run first and humans
 * can override behaviour by preventing default in their handler.
 */
import { composeHandlers } from './composeHandlers';

export function mergeProps<T extends Record<string, any>, U extends Record<string, any>>(base: T, injected: U): T & U {
  const out: Record<string, any> = { ...(injected as any) };

  for (const k of Object.keys(base)) {
    const bv = (base as any)[k];
    const iv = (injected as any)[k];

    if (typeof bv === 'function' && typeof iv === 'function' && k.startsWith('on')) {
      // Compose: injected first, then base (human) so humans can short-circuit
      out[k] = composeHandlers(iv, bv);
      continue;
    }

    // Prefer base (human) values in other cases
    out[k] = bv;
  }

  return out as T & U;
}
