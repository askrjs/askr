/**
 * Client-side navigation with History API
 */

import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import {
  configureNavigationRegistryHost,
  getCurrentHref,
  hasRegisteredApps,
  parseTargetUrl,
} from './navigation-registry';
import {
  applyNavigationTargets,
  applyPopStateNavigationTargets,
  beginRouteRequest,
  cancelRouteRequests,
  isStaleRouteRequest,
  resolveNavigationTargetsForApps,
  type AppNavigationTarget,
  type NavigateOptions,
  type NavigationRedirectState,
} from './navigation-targets';
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

configureNavigationRegistryHost({
  cancelRouteRequests,
});

/** Navigate the client-side router to `path` using the History API. */
export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  prepareNavigationFocus();

  const targetPath = addRouteBasePath(path, getActiveRouteBasePath());
  const initialTarget = parseTargetUrl(targetPath);
  const redirectState: NavigationRedirectState = {
    redirects: 0,
    visited: new Set([
      `${initialTarget.pathname}${initialTarget.search}${initialTarget.hash}`,
    ]),
  };

  if (isRuntimeSchedulerExecuting()) {
    queueMicrotask(() => {
      navigateWithRedirectState(targetPath, options, redirectState);
    });
    return;
  }

  navigateWithRedirectState(targetPath, options, redirectState);
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
        navigate
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
  if (typeof window === 'undefined' || navigationInitialized) {
    return;
  }

  navigationInitialized = true;
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('pointerdown', captureNavigationFocus, true);
  document.addEventListener('click', releaseNavigationFocusCapture);
}

export function cleanupNavigation(): void {
  cancelRouteRequests();

  if (typeof window === 'undefined' || !navigationInitialized) {
    return;
  }

  navigationInitialized = false;
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('pointerdown', captureNavigationFocus, true);
  document.removeEventListener('click', releaseNavigationFocusCapture);
}
