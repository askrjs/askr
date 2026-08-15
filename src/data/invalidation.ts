import {
  documentVisible,
  routeActive,
  timer,
  windowFocused,
  type ActivityPredicate,
} from '../runtime';
import {
  invalidateQueriesForRuntime,
  resolveDataRuntimeState,
} from './data-runtime';
import { createQueryScope } from './query-key';
import type {
  InvalidateOnIntervalOptions,
  InvalidateOptions,
  QueryScope,
} from './types';

/** Mark all cached queries whose key starts with `prefix` as stale, triggering a refresh. */
export function invalidate(prefix: string, options?: InvalidateOptions): void {
  invalidateQueriesForRuntime(
    resolveDataRuntimeState(options?.runtime),
    prefix,
    options?.markPendingWrite ?? false
  );
}

/** Create a {@link QueryScope} that namespaces keys and invalidations under `namespace`. */
export function queryScope(namespace: string): QueryScope {
  return createQueryScope(namespace, invalidate);
}

const INVALIDATE_ON_INTERVAL_OPTIONS_ERROR =
  '[Askr] invalidateOnInterval() requires an options object with a finite numeric intervalMs.';

/**
 * Periodically invalidate queries matching `prefix` on a fixed interval,
 * optionally gated by active route, document visibility, or window focus.
 */
export function invalidateOnInterval(
  prefix: string,
  options: InvalidateOnIntervalOptions
): void {
  if (
    !options ||
    typeof options !== 'object' ||
    typeof options.intervalMs !== 'number' ||
    !Number.isFinite(options.intervalMs)
  ) {
    throw new Error(INVALIDATE_ON_INTERVAL_OPTIONS_ERROR);
  }

  const runtimeState = resolveDataRuntimeState(options.runtime);
  const when: ActivityPredicate[] = [];

  if (options.activeOn) {
    when.push(routeActive(options.activeOn));
  }

  if (options.visibleOnly) {
    when.push(documentVisible());
  }

  if (options.focusedOnly) {
    when.push(windowFocused());
  }

  timer(
    options.intervalMs,
    () => {
      invalidateQueriesForRuntime(
        runtimeState,
        prefix,
        options.markPendingWrite ?? false
      );
    },
    when.length > 0 ? { when } : undefined
  );
}
