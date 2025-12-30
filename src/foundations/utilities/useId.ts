import { state } from '../../runtime/state';

let globalIdCounter = 0;

export interface UseIdOptions {
  /** Defaults to 'askr' */
  prefix?: string;
}

/**
 * useId
 *
 * Generates a stable ID for a component instance.
 * - Stable across re-renders (stored in component state)
 * - Deterministic monotonic allocation (no randomness)
 * - SSR-safe in the sense that it does not use time/randomness
 */
export function useId(options?: UseIdOptions): string {
  const prefix = options?.prefix ?? 'askr';

  // Must be called unconditionally (like other runtime primitives)
  const id = state<string>(`${prefix}-${++globalIdCounter}`);
  return id();
}
