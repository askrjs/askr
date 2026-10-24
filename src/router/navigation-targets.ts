import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import {
  applyHistoryScroll,
  applyNavigationScroll,
  hasSavedScrollPosition,
  saveScrollPosition,
} from './navigation-scroll';
import { publishLocation } from './route-query';
import {
  allowNavigationLeave,
  hasNavigationBlockers,
} from './navigation-block';
import { reportBlockedNavigation } from './navigation-state';
import { applyNavigationFocus } from './navigation-focus';
import {
  getCurrentHref,
  getCurrentPathname,
  getWindowHref,
  isCurrentOrigin,
  parseNavigationTarget,
  parseTargetUrl,
  toDocumentUrl,
} from './navigation-registry';
import { loadDocument, reloadDocument } from './document-navigation';
import {
  commitHistoryIndex,
  nextHistoryIndex,
  returnToRenderedHistoryEntry,
} from './history-index';
import { isStaleRouteRequest } from './navigation-request';
import { commitNavigationRoots } from './navigation-commit';
import { createNavigationTarget } from './navigation-resolution';
import { getRouteRevalidation, refreshRouteRenderResult } from './resolution';
import { hasCurrentNavigationOwners, isRenderResult } from './navigation-types';
import type {
  NavigateOptions,
  NavigationRedirectState,
  AppNavigationTarget,
} from './navigation-types';

export type {
  NavigateOptions,
  NavigationRedirectState,
  AppNavigationTarget,
} from './navigation-types';
export {
  beginRouteRequest,
  isStaleRouteRequest,
  cancelRouteRequests,
} from './navigation-request';
export { resolveNavigationTargetsForApps } from './navigation-resolution';

/**
 * A committed route that rendered cached loader data refreshes in place once
 * the background request settles. Any newer navigation request, or a replaced
 * app owner, makes the refresh obsolete; the cache is already up to date for
 * the next visit.
 */
function scheduleRevalidationRefresh(
  requestId: number,
  pathname: string,
  href: string,
  targets: readonly AppNavigationTarget[],
  locationState: { hasState: boolean; state: unknown }
): void {
  for (const target of targets) {
    const resolved = target.resolved;
    if (!isRenderResult(resolved)) continue;
    const revalidation = getRouteRevalidation(resolved);
    if (!revalidation) continue;
    // Only a root that actually committed this location refreshes.
    if (getCurrentHref() !== href) continue;
    // The committed root's runtime owns the refresh; a replaced one does not.
    const committed = target.app.instance.appRuntime;
    void revalidation.then(
      async (values) => {
        if (isStaleRouteRequest(requestId)) return;
        if (target.app.instance.appRuntime !== committed) return;
        const refreshed = refreshRouteRenderResult(resolved, values);
        if (!refreshed) return;
        const next = await createNavigationTarget(
          target.app,
          refreshed,
          committed
        );
        if (isStaleRouteRequest(requestId)) return;
        if (target.app.instance.appRuntime !== committed) return;
        try {
          commitNavigationRoots(
            requestId,
            pathname,
            href,
            [next],
            locationState,
            () => undefined,
            () => undefined
          );
        } catch (error) {
          logger.error('[Askr] route data refresh failed:', error);
        }
      },
      () => undefined
    );
  }
}

const MAX_NAVIGATION_REDIRECTS = 20;

export function getRedirectHistoryMode(
  replace: boolean | undefined
): 'push' | 'replace' {
  return replace === false ? 'push' : 'replace';
}

export function getNavigationHistoryMode(
  options: NavigateOptions
): 'push' | 'replace' {
  if (options.history) {
    return options.history;
  }

  return options.replace ? 'replace' : 'push';
}

export function applyNavigationTargets(
  requestId: number,
  path: string,
  options: NavigateOptions,
  redirectState: NavigationRedirectState,
  pathname: string,
  href: string,
  targets: AppNavigationTarget[],
  navigateWithRedirectState: (
    path: string,
    options: NavigateOptions,
    redirectState: NavigationRedirectState
  ) => void
): void {
  if (isStaleRouteRequest(requestId)) {
    return;
  }
  if (!hasCurrentNavigationOwners(targets)) return;
  const previousPathname = getCurrentPathname();
  const previousHref = getCurrentHref();

  for (const target of targets) {
    const resolved = target.resolved;
    if (!resolved || resolved.kind !== 'redirect') {
      continue;
    }

    const redirectTarget = parseNavigationTarget(resolved.to);
    const redirectHref = isCurrentOrigin(redirectTarget)
      ? `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`
      : redirectTarget.href;
    if (redirectHref === href) {
      if (isDevelopmentEnvironment()) {
        logger.warn(
          `Navigation guard redirected to the same path: ${redirectHref}`
        );
      }
      return;
    }

    if (redirectState.visited.has(redirectHref)) {
      throw new Error(
        `[Askr] Navigation redirect cycle detected at ${redirectHref}.`
      );
    }
    if (redirectState.redirects >= MAX_NAVIGATION_REDIRECTS) {
      throw new Error(
        `[Askr] Navigation redirect limit exceeded (${MAX_NAVIGATION_REDIRECTS}).`
      );
    }

    // Leaving for the redirect target is leaving the page like any other;
    // a blocker that began objecting while the route resolved refuses it.
    if (
      !redirectState.skipBlockers &&
      hasNavigationBlockers() &&
      !allowNavigationLeave(redirectState.confirmed)
    ) {
      reportBlockedNavigation(redirectHref);
      return;
    }

    redirectState.visited.add(redirectHref);
    redirectState.redirects++;
    navigateWithRedirectState(
      redirectHref,
      {
        history: getRedirectHistoryMode(resolved.replace),
      },
      redirectState
    );
    return;
  }

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    // No registered app can render it (unmatched, or outside every basePath),
    // so the browser must load it rather than the click doing nothing. The
    // current URL is already loaded: reloading it could loop forever when
    // unrouted code navigates on mount.
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${path}`);
    }
    if (href !== getWindowHref()) {
      loadDocument(toDocumentUrl(href), getNavigationHistoryMode(options));
    }
    return;
  }

  if (isStaleRouteRequest(requestId)) {
    return;
  }

  const hasState = Object.prototype.hasOwnProperty.call(options, 'state');
  const locationState = {
    hasState,
    state: hasState ? options.state : undefined,
  };
  if (hasState) assertCloneableHistoryState(locationState.state);
  // Read the departing page's offset before its content is replaced: the
  // browser clamps the scroll position as soon as the document shrinks.
  saveScrollPosition(previousHref);
  commitNavigationRoots(
    requestId,
    pathname,
    href,
    matchedTargets,
    locationState,
    () => {
      const historyMode = getNavigationHistoryMode(options);
      const historyIndex = nextHistoryIndex(historyMode);
      window.history[historyMode === 'replace' ? 'replaceState' : 'pushState'](
        {
          path: href,
          askrHasState: locationState.hasState,
          askrState: locationState.state,
          askrIndex: historyIndex,
        },
        '',
        toDocumentUrl(href)
      );
      commitHistoryIndex(historyIndex);
    },
    () => {
      const destination = parseTargetUrl(href);
      if (pathname !== previousPathname || destination.hash)
        applyNavigationScroll(options.scroll);
      // A fragment names its own target and a same-page query change keeps
      // the visitor where they are.
      if (pathname !== previousPathname && !destination.hash) {
        applyNavigationFocus({
          pathname: destination.pathname,
          search: destination.search,
          hash: destination.hash,
        });
      }
    }
  );
  scheduleRevalidationRefresh(
    requestId,
    pathname,
    href,
    matchedTargets,
    locationState
  );
}

/**
 * A history entry for the rendered page that differs only by fragment: the
 * page stays, the location and scroll move. Mirrors `navigate()`'s fragment
 * path for back/forward traversal.
 */
export function applyPopStateFragmentChange(
  previousHref: string,
  historyIndex: number | undefined,
  pathname: string,
  href: string,
  state: unknown
): void {
  saveScrollPosition(previousHref);
  commitHistoryIndex(historyIndex);
  publishLocation(pathname, href);
  // An entry traversed before (back, forward) restores its offset; a fresh
  // one (a native anchor click) scrolls to its fragment, as navigate() does.
  if (hasSavedScrollPosition(href, state)) applyHistoryScroll(href, state);
  else applyNavigationScroll();
}

export function applyPopStateNavigationTargets(
  requestId: number,
  previousHref: string,
  historyIndex: number | undefined,
  pathname: string,
  href: string,
  state: unknown,
  targets: AppNavigationTarget[],
  navigate: (path: string, options: NavigateOptions) => void
): void {
  if (isStaleRouteRequest(requestId)) {
    return;
  }
  if (!hasCurrentNavigationOwners(targets)) {
    if (!returnToRenderedHistoryEntry()) reloadDocument();
    return;
  }

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    // The browser already moved to this entry; only a document load can
    // render it, so the old page does not stay mounted under the new URL.
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${pathname}`);
    }
    reloadDocument();
    return;
  }

  for (const target of matchedTargets) {
    const resolved = target.resolved!;
    if (resolved.kind !== 'redirect') {
      continue;
    }

    navigate(resolved.to, {
      history: getRedirectHistoryMode(resolved.replace),
    });
    return;
  }

  saveScrollPosition(previousHref);
  const historyState = state as {
    askrHasState?: unknown;
    askrState?: unknown;
  } | null;
  const hasState = historyState?.askrHasState === true;
  commitNavigationRoots(
    requestId,
    pathname,
    href,
    matchedTargets,
    { hasState, state: hasState ? historyState?.askrState : undefined },
    () => commitHistoryIndex(historyIndex),
    () => applyHistoryScroll(href, state),
    () => {
      // A newer navigation owns history now.
      if (isStaleRouteRequest(requestId)) return;
      // Traverse back to the entry whose page is still rendered, which may
      // be several entries away when this traversal superseded a pending
      // one, rather than rewriting the entry the user landed on. If either
      // position is unknown, the landed URL is the only truth left: load it.
      if (!returnToRenderedHistoryEntry()) reloadDocument();
    }
  );
  scheduleRevalidationRefresh(requestId, pathname, href, matchedTargets, {
    hasState,
    state: hasState ? historyState?.askrState : undefined,
  });
}

/**
 * `history.pushState` rejects state that cannot be structured-cloned, and it
 * runs after the destination has rendered. Checking first keeps the page and
 * the URL in agreement: an uncloneable value fails before anything changes.
 */
export function assertCloneableHistoryState(state: unknown): void {
  if (typeof structuredClone !== 'function') return;
  try {
    structuredClone(state);
  } catch (error) {
    const failure = new TypeError(
      '[Askr] Navigation state must be structured-cloneable; it is stored in history.state.'
    );
    (failure as { cause?: unknown }).cause = error;
    throw failure;
  }
}
