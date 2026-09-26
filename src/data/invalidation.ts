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

/**
 * Mark all cached queries under `prefix` as stale, triggering a refresh.
 * Matching is by `:`-delimited segment: a key matches when it equals `prefix`,
 * when `prefix` ends in `:`, or when the key continues `prefix` at a `:`
 * (`'user:1'` matches `user:1:posts` but not `user:10`). Only `:` is a
 * segment boundary; the empty prefix matches every key.
 */
export function invalidate(prefix: string, options?: InvalidateOptions): void {
  invalidateQueriesForRuntime(
    resolveDataRuntimeState(options?.runtime),
    prefix,
    options?.markPendingWrite ?? false
  );
}

/** Create a {@link QueryScope} that namespaces keys and can bind invalidations to a runtime. */
export function queryScope(
  namespace: string,
  options?: Pick<InvalidateOptions, 'runtime'>
): QueryScope {
  return createQueryScope(namespace, (prefix, callOptions) =>
    invalidate(prefix, {
      ...callOptions,
      runtime: callOptions?.runtime ?? options?.runtime,
    })
  );
}

const INVALIDATE_ON_INTERVAL_OPTIONS_ERROR =
  '[Askr] invalidateOnInterval() requires an options object with a finite numeric intervalMs.';

/**
 * Periodically invalidate queries matching `prefix` on a fixed interval,
 * optionally gated by active route, document visibility, or window focus.
 * `prefix` matches key segments the same way as {@link invalidate}.
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
