import { isPromiseLike } from '../common/promise';
import { normalizeRouteBasePath, removeRouteBasePath } from './base-path';
import { _preloadRouteRecord } from './lazy';
import {
  getRegisteredAppsSnapshot,
  isCurrentOrigin,
  parseTargetUrl,
} from './navigation-registry';
import { resolveNavigationTargetsForApps } from './navigation-resolution';
import { getMatchingRouteRecord } from './route-matching';

/** A href prefetched this recently is not prefetched again. */
const PREFETCH_TTL_MS = 30_000;
const PREFETCH_MEMORY_LIMIT = 200;
const recent = new Map<string, number>();

function ignore(): void {
  // A prefetch is an optimization: its failures surface on the real navigation.
}

/**
 * Warm what a navigation to `publicHref` will need: start the lazy chunk of the
 * matching route, then resolve it the way a navigation does (auth, policies,
 * `preload`, loaders through the loader cache) without committing anything.
 * Cross-origin and unmatched hrefs are ignored, as is a href prefetched in the
 * last thirty seconds.
 */
export function prefetchRoute(publicHref: string): void {
  if (typeof window === 'undefined') return;
  let target: URL;
  try {
    target = parseTargetUrl(publicHref);
  } catch {
    return;
  }
  if (!isCurrentOrigin(target)) return;
  const href = `${target.pathname}${target.search}`;
  const now = Date.now();
  const last = recent.get(href);
  if (last !== undefined && now - last < PREFETCH_TTL_MS) return;
  if (recent.size >= PREFETCH_MEMORY_LIMIT) recent.clear();
  recent.set(href, now);

  const apps = getRegisteredAppsSnapshot();
  let matched = false;
  for (const app of apps) {
    const logical = removeRouteBasePath(
      href,
      normalizeRouteBasePath(app.registry.manifest.basePath)
    );
    if (logical === undefined) continue;
    const match = getMatchingRouteRecord(
      logical,
      app.registry.manifest.records
    );
    if (!match) continue;
    matched = true;
    _preloadRouteRecord(match.record)?.catch(ignore);
  }
  if (!matched) return;

  try {
    const resolved = resolveNavigationTargetsForApps(
      target.pathname,
      href,
      new AbortController().signal,
      { prefetch: true }
    );
    if (isPromiseLike(resolved)) void Promise.resolve(resolved).catch(ignore);
  } catch {
    // Synchronous failures are the same as asynchronous ones: not for a prefetch to report.
  }
}

/** @internal Forget recent prefetches. Part of the router-wide reset. */
export function resetRoutePrefetch(): void {
  recent.clear();
}
