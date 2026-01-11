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
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. No Auto-Generation
 *    Caller must provide the `id`. No random/sequential generation.
 *    This ensures determinism and SSR safety.
 *
 * 2. Format Convention
 *    IDs are formatted as `{prefix}-{id}`.
 *    Default prefix is "askr".
 *
 * 3. Type Coercion
 *    Numbers are coerced to strings via String().
 *    This is deterministic and consistent.
 */
export function useId(options: UseIdOptions): string {
  const prefix = options.prefix ?? 'askr';
  return `${prefix}-${String(options.id)}`;
}
