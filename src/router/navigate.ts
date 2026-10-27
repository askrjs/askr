/**
 * Client-side navigation with History API
 */

import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import {
  configureNavigationRegistryHost,
  getCurrentHref,
  getRegisteredAppsSnapshot,
  hasRegisteredApps,
  isCurrentOrigin,
  parseNavigationTarget,
  parseTargetUrl,
  syncRegisteredRouteSnapshot,
  toDocumentUrl,
} from './navigation-registry';
import {
  applyNavigationTargets,
  applyPopStateFragmentChange,
  applyPopStateNavigationTargets,
  assertCloneableHistoryState,
  getNavigationHistoryMode,
} from './navigation-targets';
import {
  beginRouteRequest,
  cancelRouteRequests,
  isStaleRouteRequest,
} from './navigation-request';
import { resolveNavigationTargetsForApps } from './navigation-resolution';
import { currentRouteLocationState } from './activity';
import type {
  AppNavigationTarget,
  NavigateOptions,
  NavigationRedirectState,
} from './navigation-types';
import type { RouteDestination } from '../common/router';
import { addLogicalRouteBasePath } from './base-path';
import { resolveNavigationUrl } from '../common/url';
import { loadDocument } from './document-navigation';
import { getActiveRouteBasePath } from './store';
import {
  applyNavigationScroll,
  beginHistoryFocusRestoration,
  captureNavigationFocus,
  prepareNavigationFocus,
  releaseNavigationFocusCapture,
} from './navigation-scroll';
import { isFlushing as isRuntimeSchedulerExecuting } from '../core/reactive/scheduler';
import { deferNavigationUntilCommitSettles } from './navigation-commit';
import {
  cancelHistoryReturn,
  commitHistoryIndex,
  consumeHistoryReturn,
  initializeHistoryIndex,
  landOnHistoryEntry,
  returnToRenderedHistoryEntry,
} from './history-index';
import { reloadDocument } from './document-navigation';
import { configureRouteRetry } from './route-error';
import {
  beginNavigationChunkTracking,
  reloadForStaleDeployment,
} from './stale-deployment';
import { configureRedirectHost } from '../common/redirect-host';
import {
  allowNavigationLeave,
  hasNavigationBlockers,
} from './navigation-block';
import {
  beginPendingNavigation,
  clearPendingNavigation,
  endPendingNavigation,
  reportBlockedNavigation,
} from './navigation-state';

export { configureScrollRestoration } from './navigation-scroll';
export { blockNavigation } from './navigation-block';
export { configureNavigationFocus } from './navigation-focus';
export { configureViewTransitions } from './view-transition';
export type { ViewTransitionsOption } from './view-transition';
export type {
  NavigationAnnouncement,
  NavigationFocusOptions,
} from './navigation-focus';
export { navigationState } from './navigation-state';
export type { NavigationState } from './navigation-state';
export type {
  HistoryScrollBehavior,
  NavigationScrollBehavior,
  ScrollRestorationOptions,
} from './navigation-scroll';
export {
  registerAppInstance,
  unregisterAppInstance,
} from './navigation-registry';
import { commitLocationOnlyNavigation } from './route-query';
export { updateRouteQuery } from './route-query';
export type {
  RouteQueryParamInput,
  RouteQueryParamValue,
  RouteQueryUpdater,
  RouteQueryUpdates,
  UpdateRouteQueryOptions,
} from './route-query';
export type { NavigateOptions };

/** Render a same-origin redirect decided outside the router in place. */
function followRedirectThroughRouter(href: string): void {
  const target = parseTargetUrl(href);
  navigateToPublicHref(`${target.pathname}${target.search}${target.hash}`);
}

/** Resolve the rendered location again; it replaces its own history entry. */
function retryCurrentRoute(): void {
  if (typeof window === 'undefined') return;
  navigateToPublicHref(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    { history: 'replace' },
    { skipBlockers: true }
  );
}

let navigationInitialized = false;
let navigationRegistryHosted = false;

/**
 * Publish request cancellation to the navigation registry.
 *
 * The registry cannot import this module (it is imported *by* it), so the
 * capability is injected. Doing that at module scope meant whether an app
 * could cancel its in-flight route requests depended on whether anything had
 * imported this module yet; every entry point that can navigate composes it.
 */
function ensureNavigationRegistryHost(): void {
  if (navigationRegistryHosted) return;
  navigationRegistryHosted = true;
  configureNavigationRegistryHost({ cancelRouteRequests });
  configureRouteRetry(retryCurrentRoute);
  configureRedirectHost(followRedirectThroughRouter);
}

/**
 * Navigate the client-side router using the History API.
 *
 * A string is a logical path: a root-relative path gains the registry
 * `basePath`. A typed destination from `to()` already carries its public href.
 * A target on another origin is handed to the browser.
 */
export function navigate(
  target: string | RouteDestination,
  options: NavigateOptions = {}
): void {
  if (options.sameOrigin && typeof target === 'string') {
    assertSameOriginTarget(target);
  }
  navigateToPublicHref(
    typeof target === 'string'
      ? addLogicalRouteBasePath(target, getActiveRouteBasePath())
      : target.href,
    options
  );
}

/** Throw unless `target` resolves to the document's own origin. */
function assertSameOriginTarget(target: string): void {
  if (typeof window === 'undefined') return;
  const url = resolveNavigationUrl(target, window.location.href);
  if (url.origin !== window.location.origin) {
    throw new TypeError(
      `navigate() with sameOrigin refused ${JSON.stringify(target)}: it is on another origin.`
    );
  }
}

/** Navigate to a public (already mounted) href without adding the `basePath`. */
export function navigateToPublicHref(
  href: string,
  options: NavigateOptions = {},
  internal?: { skipBlockers?: boolean }
): void {
  if (
    deferNavigationUntilCommitSettles(() =>
      navigateToPublicHref(href, options, internal)
    )
  ) {
    return;
  }
  ensureNavigationRegistryHost();
  if (typeof window === 'undefined') {
    return;
  }
  // Blockers guard leaving the page; the router's own session redirects and
  // a move to another fragment of the current page are not that.
  const confirmed = new Set<string>();
  const skipBlockers = internal?.skipBlockers === true;
  if (
    !skipBlockers &&
    !isFragmentOnlyMove(href) &&
    !allowNavigationLeave(confirmed)
  ) {
    reportBlockedNavigation(href);
    return;
  }

  prepareNavigationFocus();
  cancelHistoryReturn();

  const initialTarget = parseTargetUrl(href);
  const redirectState: NavigationRedirectState = {
    skipBlockers,
    confirmed,
    redirects: 0,
    visited: new Set([
      `${initialTarget.pathname}${initialTarget.search}${initialTarget.hash}`,
    ]),
  };

  if (isRuntimeSchedulerExecuting()) {
    queueMicrotask(() => {
      navigateWithRedirectState(href, options, redirectState);
    });
    return;
  }

  navigateWithRedirectState(href, options, redirectState);
}

function navigateWithRedirectState(
  path: string,
  options: NavigateOptions,
  redirectState: NavigationRedirectState
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const request = beginRouteRequest();
  if (isStaleRouteRequest(request.id)) return;
  beginNavigationChunkTracking();
  clearPendingNavigation();

  const target = parseNavigationTarget(path);
  if (!isCurrentOrigin(target)) {
    // The router cannot render another origin; the browser loads it.
    loadDocument(target.href, getNavigationHistoryMode(options));
    return;
  }
  const pathname = target.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;
  const currentHref = getCurrentHref();
  if (href !== currentHref && hasRegisteredApps()) {
    const current = parseTargetUrl(currentHref);
    if (
      current.pathname === target.pathname &&
      current.search === target.search
    ) {
      // Only the fragment changed: the page stays, the location moves.
      const hasState = Object.prototype.hasOwnProperty.call(options, 'state');
      if (hasState) assertCloneableHistoryState(options.state);
      commitLocationOnlyNavigation(pathname, href, {
        historyMode: getNavigationHistoryMode(options),
        ...(hasState ? { state: { hasState, state: options.state } } : {}),
      });
      applyNavigationScroll(options.scroll);
      return;
    }
  } else if (href === currentHref && options.history === undefined) {
    // Re-resolving the current location replaces its entry rather than
    // stacking a duplicate the user would have to step back through.
    options = { ...options, history: 'replace' };
  }
  const resolvedTargets = resolveNavigationTargetsForApps(
    pathname,
    href,
    request.signal
  );

  if (isPromiseLike(resolvedTargets)) {
    beginPendingNavigation(request.id, href);
    void Promise.resolve(resolvedTargets).then(
      (targets) => {
        endPendingNavigation(request.id);
        if (isStaleRouteRequest(request.id)) {
          return;
        }

        try {
          applyNavigationTargets(
            request.id,
            path,
            options,
            redirectState,
            pathname,
            href,
            targets,
            navigateWithRedirectState
          );
        } catch (error) {
          logger.error('[Askr] navigation failed:', error);
        }
      },
      (error) => {
        endPendingNavigation(request.id);
        if (isStaleRouteRequest(request.id)) {
          return;
        }
        logger.error('[Askr] navigation failed:', error);
        reloadForStaleDeployment(
          error,
          parseTargetUrl(href).href,
          getNavigationHistoryMode(options)
        );
      }
    );
    return;
  }

  applyNavigationTargets(
    request.id,
    path,
    options,
    redirectState,
    pathname,
    href,
    resolvedTargets,
    navigateWithRedirectState
  );
}

function handlePopState(event: PopStateEvent): void {
  if (consumeHistoryReturn(event.state)) {
    // A failed traversal returning to the entry that is still rendered.
    syncRegisteredRouteSnapshot();
    return;
  }
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const fragmentTraversal =
    href.split('#')[0] === getCurrentHref().split('#')[0];
  if (
    !fragmentTraversal &&
    hasNavigationBlockers() &&
    !allowNavigationLeave()
  ) {
    // The browser already moved: record where it landed, then go back to the
    // entry that is still rendered.
    landOnHistoryEntry(event.state);
    reportBlockedNavigation(
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
    if (returnToRenderedHistoryEntry()) return;
    // The position is unknown: push the rendered location again so the page
    // and the URL agree. The refused entry stays behind it, and forward
    // entries are lost.
    const renderedHref = getCurrentHref();
    const rendered = currentRouteLocationState();
    window.history.pushState(
      {
        path: renderedHref,
        askrHasState: rendered.hasState,
        askrState: rendered.state,
      },
      '',
      toDocumentUrl(renderedHref)
    );
    commitHistoryIndex(undefined);
    return;
  }
  beginHistoryFocusRestoration();
  const request = beginRouteRequest();
  if (isStaleRouteRequest(request.id)) return;
  beginNavigationChunkTracking();
  clearPendingNavigation();
  const previousHref = getCurrentHref();
  const historyIndex = landOnHistoryEntry(event.state, fragmentTraversal);
  const pathname = window.location.pathname;

  if (!hasRegisteredApps()) {
    return;
  }
  if (fragmentTraversal) {
    // Only the fragment differs from the rendered page: no route to resolve.
    applyPopStateFragmentChange(
      previousHref,
      historyIndex,
      pathname,
      href,
      event.state
    );
    return;
  }

  const applyResolved = (targets: AppNavigationTarget[]) => {
    try {
      applyPopStateNavigationTargets(
        request.id,
        previousHref,
        historyIndex,
        pathname,
        href,
        event.state,
        targets,
        (path, options) =>
          navigateToPublicHref(path, options, { skipBlockers: true })
      );
    } catch (error) {
      logger.error('[Askr] popstate navigation failed:', error);
    }
  };

  const resolvedTargets = resolveNavigationTargetsForApps(
    pathname,
    href,
    request.signal
  );

  if (isPromiseLike<AppNavigationTarget[]>(resolvedTargets)) {
    beginPendingNavigation(request.id, href);
    void Promise.resolve(resolvedTargets).then(
      (next) => {
        endPendingNavigation(request.id);
        applyResolved(next);
      },
      (error) => {
        endPendingNavigation(request.id);
        if (isStaleRouteRequest(request.id)) {
          return;
        }
        logger.error('[Askr] popstate navigation failed:', error);
        if (reloadForStaleDeployment(error, window.location.href, 'replace')) {
          return;
        }
        // Nothing rendered this entry; send the user back to the one that is.
        if (!returnToRenderedHistoryEntry()) reloadDocument();
      }
    );
    return;
  }

  applyResolved(resolvedTargets);
}

export function initializeNavigation(): void {
  ensureNavigationRegistryHost();
  if (typeof window === 'undefined') {
    return;
  }

  // Only the first mounted app adopts the active entry: a later app may mount
  // while a back/forward render is in flight, when the active entry is not
  // the rendered one.
  if (getRegisteredAppsSnapshot().length <= 1) initializeHistoryIndex();
  if (navigationInitialized) {
    return;
  }

  navigationInitialized = true;
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('pointerdown', captureNavigationFocus, true);
  document.addEventListener('click', releaseNavigationFocusCapture);
}

export function cleanupNavigation(): void {
  ensureNavigationRegistryHost();
  cancelRouteRequests();
  clearPendingNavigation();

  if (typeof window === 'undefined' || !navigationInitialized) {
    return;
  }

  navigationInitialized = false;
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('pointerdown', captureNavigationFocus, true);
  document.removeEventListener('click', releaseNavigationFocusCapture);
}

function isFragmentOnlyMove(href: string): boolean {
  const current = getCurrentHref();
  if (!current || !hasRegisteredApps()) return false;
  const target = parseTargetUrl(href);
  const here = parseTargetUrl(current);
  return (
    target.pathname === here.pathname &&
    target.search === here.search &&
    target.hash !== here.hash
  );
}
