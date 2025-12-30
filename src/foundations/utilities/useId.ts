export interface UseIdOptions {
  /** Defaults to 'askr' */
  prefix?: string;
  /** Stable, caller-provided identity */
  id: string | number;
}

/**
 * useId
 *
 * Formats a stable ID from a caller-provided identity.
 * - Pure and deterministic (no time/randomness/global counters)
 * - SSR-safe
 */
export function useId(options: UseIdOptions): string {
  const prefix = options.prefix ?? 'askr';
  return `${prefix}-${String(options.id)}`;
}
