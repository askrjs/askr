import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import {
  applyHistoryScroll,
  applyNavigationScroll,
  saveScrollPosition,
} from './navigation-scroll';
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
  commitNavigationRoots(
    requestId,
    pathname,
    href,
    matchedTargets,
    locationState,
    () => {
      saveScrollPosition(previousHref);
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
      if (pathname !== previousPathname || parseTargetUrl(href).hash)
        applyNavigationScroll(options.scroll);
    }
  );
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

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    // Only the fragment moved away from the rendered page, which is still
    // the right page for this entry.
    if (href.split('#')[0] === previousHref.split('#')[0]) {
      commitHistoryIndex(historyIndex);
      return;
    }
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
}
