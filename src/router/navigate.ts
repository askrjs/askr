/**
 * Client-side navigation with History API
 */

import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import {
  configureNavigationRegistryHost,
  getCurrentHref,
  hasRegisteredApps,
  isCurrentOrigin,
  parseTargetUrl,
} from './navigation-registry';
import {
  applyNavigationTargets,
  applyPopStateNavigationTargets,
  beginRouteRequest,
  cancelRouteRequests,
  getNavigationHistoryMode,
  isStaleRouteRequest,
  resolveNavigationTargetsForApps,
  type AppNavigationTarget,
  type NavigateOptions,
  type NavigationRedirectState,
} from './navigation-targets';
import type { RouteDestination } from '../common/router';
import { isSafeHref } from '../common/url';
import { addRouteBasePath } from './base-path';
import { getActiveRouteBasePath } from './store';
import {
  beginHistoryFocusRestoration,
  captureNavigationFocus,
  prepareNavigationFocus,
  releaseNavigationFocusCapture,
} from './navigation-scroll';
import { isRuntimeSchedulerExecuting } from '../runtime';

export { configureScrollRestoration } from './navigation-scroll';
export type {
  HistoryScrollBehavior,
  NavigationScrollBehavior,
  ScrollRestorationOptions,
} from './navigation-scroll';
export {
  registerAppInstance,
  unregisterAppInstance,
} from './navigation-registry';
export { updateRouteQuery } from './route-query';
export type {
  RouteQueryParamInput,
  RouteQueryParamValue,
  RouteQueryUpdater,
  RouteQueryUpdates,
  UpdateRouteQueryOptions,
} from './route-query';
export type { NavigateOptions };

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
  navigateToPublicHref(
    typeof target === 'string'
      ? addRouteBasePath(target, getActiveRouteBasePath())
      : target.href,
    options
  );
}

/** Navigate to a public (already mounted) href without adding the `basePath`. */
export function navigateToPublicHref(
  href: string,
  options: NavigateOptions = {}
): void {
  ensureNavigationRegistryHost();
  if (typeof window === 'undefined') {
    return;
  }

  prepareNavigationFocus();

  const initialTarget = parseTargetUrl(href);
  const redirectState: NavigationRedirectState = {
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

/** The router cannot render another origin; the browser loads it instead. */
function loadCrossOriginDocument(target: URL, options: NavigateOptions): void {
  if (!isSafeHref(target.href)) {
    throw new TypeError('Navigation target uses an unsafe URL scheme.');
  }
  if (getNavigationHistoryMode(options) === 'replace') {
    window.location.replace(target.href);
  } else {
    window.location.assign(target.href);
  }
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

  const target = parseTargetUrl(path);
  if (!isCurrentOrigin(target)) {
    loadCrossOriginDocument(target, options);
    return;
  }
  const pathname = target.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;
  const resolvedTargets = resolveNavigationTargetsForApps(
    pathname,
    href,
    request.signal
  );

  if (isPromiseLike(resolvedTargets)) {
    void Promise.resolve(resolvedTargets).then(
      (targets) => {
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
        if (isStaleRouteRequest(request.id)) {
          return;
        }
        logger.error('[Askr] navigation failed:', error);
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
  beginHistoryFocusRestoration();
  const request = beginRouteRequest();
  const previousHref = getCurrentHref();
  const pathname = window.location.pathname;
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (!hasRegisteredApps()) {
    return;
  }

  const applyResolved = (targets: AppNavigationTarget[]) => {
    try {
      applyPopStateNavigationTargets(
        request.id,
        previousHref,
        { path: previousHref },
        pathname,
        href,
        event.state,
        targets,
        navigateToPublicHref
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
    void Promise.resolve(resolvedTargets).then(
      (next) => {
        applyResolved(next);
      },
      (error) => {
        if (isStaleRouteRequest(request.id)) {
          return;
        }
        logger.error('[Askr] popstate navigation failed:', error);
      }
    );
    return;
  }

  applyResolved(resolvedTargets);
}

export function initializeNavigation(): void {
  ensureNavigationRegistryHost();
  if (typeof window === 'undefined' || navigationInitialized) {
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

  if (typeof window === 'undefined' || !navigationInitialized) {
    return;
  }

  navigationInitialized = false;
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('pointerdown', captureNavigationFocus, true);
  document.removeEventListener('click', releaseNavigationFocusCapture);
}
