import { logger } from '../common/logger';
import {
  findRouteLoaderEntries,
  type RouteLoaderEntry,
} from '../data/data-runtime';
import type { DataRuntime } from '../data/types';

/** Entries kept per data runtime before the least recently used is dropped. */
export const ROUTE_LOADER_CACHE_LIMIT = 100;

/** Key prefix of every route loader entry; pass it (or a longer one) to `invalidate()`. */
export const ROUTE_DATA_KEY_PREFIX = 'route-data';

const ownerIds = new WeakMap<object, number>();
let nextOwnerId = 0;

/**
 * Registries sharing one data runtime (several roots, test fixtures) must not
 * share entries for equal templates, so the declaring record joins the key.
 */
function ownerId(owner: object): number {
  let id = ownerIds.get(owner);
  if (id === undefined) {
    id = nextOwnerId;
    nextOwnerId += 1;
    ownerIds.set(owner, id);
  }
  return id;
}

/**
 * Loader results are keyed by route template, params and search, so one URL
 * shares one entry however it was reached. `slot` separates a group/page
 * loader's entry from the leaf's.
 */
export function routeLoaderKey(
  owner: object,
  path: string,
  params: Readonly<Record<string, string>>,
  search: string,
  slot: string
): string {
  const entries = Object.entries(params).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  return `${ROUTE_DATA_KEY_PREFIX}:${path}:${ownerId(owner)}:${JSON.stringify(entries)}:${search}:${slot}`;
}

/** Fresh data is served without revalidation until it is `staleTimeMs` old. */
export type RouteStaleTime = number | 'always';

export interface CachedLoadOptions {
  /** The navigation's signal; the request is cancelled when all its waiters leave. */
  readonly signal: AbortSignal;
  readonly staleTimeMs: RouteStaleTime;
}

export interface CachedLoad {
  /** The cached value, or the request for it when there is none. */
  readonly value: unknown;
  /** Settles with the fresh value once a stale cached value is refreshed. */
  readonly revalidation?: Promise<unknown>;
}

let revalidating = 0;
const revalidationListeners = new Set<() => void>();

/** Number of background loader revalidations in flight. */
export function activeRouteRevalidations(): number {
  return revalidating;
}

export function onRouteRevalidationChange(listener: () => void): () => void {
  revalidationListeners.add(listener);
  return () => {
    revalidationListeners.delete(listener);
  };
}

function trackRevalidation(promise: Promise<unknown>): void {
  revalidating += 1;
  for (const listener of revalidationListeners) listener();
  const done = () => {
    revalidating -= 1;
    for (const listener of revalidationListeners) listener();
  };
  void promise.then(done, done);
}

function isStale(
  entry: RouteLoaderEntry,
  staleTimeMs: RouteStaleTime
): boolean {
  return (
    staleTimeMs === 'always' || Date.now() - entry.completedAt >= staleTimeMs
  );
}

function touch(entries: Map<string, RouteLoaderEntry>, key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  entries.set(key, entry);
}

function evict(entries: Map<string, RouteLoaderEntry>): void {
  for (const [key, entry] of entries) {
    if (entries.size <= ROUTE_LOADER_CACHE_LIMIT) return;
    // An entry with a request in flight is still wanted.
    if (!entry.inflight) entries.delete(key);
  }
}

function startRequest(
  entries: Map<string, RouteLoaderEntry>,
  key: string,
  entry: RouteLoaderEntry,
  run: (signal: AbortSignal) => unknown,
  background: boolean
): NonNullable<RouteLoaderEntry['inflight']> {
  const controller = new AbortController();
  const promise: Promise<unknown> = new Promise<unknown>((resolve) =>
    resolve(run(controller.signal))
  ).then(
    (data) => {
      if (entry.inflight?.promise === promise) delete entry.inflight;
      // An invalidation replaced or removed the entry: do not resurrect it.
      if (entries.get(key) === entry) {
        entry.hasData = true;
        entry.data = data;
        entry.completedAt = Date.now();
        touch(entries, key);
      }
      return data;
    },
    (error: unknown) => {
      if (entry.inflight?.promise === promise) delete entry.inflight;
      if (!entry.hasData && entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  );
  const inflight = { promise, controller, waiters: 0, background };
  entry.inflight = inflight;
  return inflight;
}

/**
 * Run a route loader through the data runtime's cache.
 *
 * - Cached data is returned at once; when it is stale (`staleTimeMs`, default
 *   always) a background request refreshes it and `revalidation` settles with
 *   the new value.
 * - Without cached data the request is the value. Concurrent callers for one
 *   key share a request, which is cancelled only when every waiting
 *   navigation has gone.
 * - A runtime without a cache (hand-built, disposed) runs the loader directly.
 */
export function loadThroughCache(
  runtime: DataRuntime | undefined,
  key: string,
  run: (signal: AbortSignal) => unknown,
  options: CachedLoadOptions
): CachedLoad {
  const entries = runtime ? findRouteLoaderEntries(runtime) : undefined;
  if (!entries) return { value: run(options.signal) };

  let entry = entries.get(key);
  if (!entry) {
    entry = { hasData: false, data: undefined, completedAt: 0 };
    entries.set(key, entry);
    evict(entries);
  } else {
    touch(entries, key);
  }

  if (entry.hasData) {
    if (!isStale(entry, options.staleTimeMs)) return { value: entry.data };
    const joining = entry.inflight;
    const inflight = joining ?? startRequest(entries, key, entry, run, true);
    if (!joining) {
      trackRevalidation(inflight.promise);
      // A failed refresh keeps the cached value; the next visit retries.
      inflight.promise.catch((error: unknown) =>
        logger.warn('[Askr] route data revalidation failed:', error)
      );
    }
    return { value: entry.data, revalidation: inflight.promise };
  }

  const inflight =
    entry.inflight ?? startRequest(entries, key, entry, run, false);
  inflight.background = false;
  inflight.waiters += 1;
  // A navigation keeps the request's signal alive after the request settles:
  // loaders hand it to deferred work that must stop when the page is left.
  const onAbort = () => {
    inflight.waiters -= 1;
    if (inflight.waiters === 0 && !inflight.background) {
      inflight.controller.abort(options.signal.reason);
      // Nobody wants this request any more, and a loader may ignore its
      // signal: later navigations must start their own.
      if (entry.inflight === inflight) delete entry.inflight;
      if (!entry.hasData && entries.get(key) === entry) entries.delete(key);
    }
  };
  if (options.signal.aborted) onAbort();
  else options.signal.addEventListener('abort', onAbort, { once: true });
  return { value: inflight.promise };
}
