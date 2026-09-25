import { isDevelopmentEnvironment } from '../common/env';

// Maximum runs of one task or reactive entry within a single scheduler flush
// before it is treated as an update loop, skipped, and reported.
export const MAX_FLUSH_DEPTH = 50;

// Production counts per-entry runs only once a flush has run 1000 of them, so
// ordinary flushes pay only a counter check for the loop guard.
export function getLoopGuardThreshold(): number {
  return isDevelopmentEnvironment() ? 0 : 1000;
}

interface FlushIdentity {
  getFlushVersion(): number;
}

// Counts runs per entry across every batch drained within one scheduler
// flush (identified by scheduler and flush version). The guard returns the
// loop error the first time an entry exceeds MAX_FLUSH_DEPTH, true while it
// stays over the limit (skip it silently), and false otherwise.
export function createFlushLoopGuard<K extends object>(
  label: string,
  alwaysCount?: boolean
): (flush: FlushIdentity, key: K) => Error | boolean {
  let current: FlushIdentity | null = null;
  let version = -1;
  let threshold = 0;
  let total = 0;
  let runs: WeakMap<K, number> | null = null;

  return (flush, key) => {
    const flushVersion = flush.getFlushVersion();
    if (flush !== current || flushVersion !== version) {
      current = flush;
      version = flushVersion;
      threshold = alwaysCount ? 0 : getLoopGuardThreshold();
      total = 0;
      runs = null;
    }
    if (total++ < threshold) return false;
    const count = ((runs ??= new WeakMap()).get(key) ?? 0) + 1;
    runs.set(key, count);
    return (
      count > MAX_FLUSH_DEPTH &&
      (count > MAX_FLUSH_DEPTH + 1 ||
        new Error(
          `[Askr] ${label} exceeded ${MAX_FLUSH_DEPTH} runs in one flush. Likely reactive cycle.`
        ))
    );
  };
}
