/**
 * Client-side navigation with History API
 */

import {
  resolveRoute,
  resolveRouteRequest,
  lockRouteRegistration,
  type ResolvedRoute,
} from './route';
import {
  mountComponent,
  cleanupComponent,
  type ComponentInstance,
} from '../runtime/component';
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../common/env';
import { logger } from '../dev/logger';
import type { RouteRenderResult, RouteRequestResult } from '../common/router';

// Global app state for navigation
let currentInstance: ComponentInstance | null = null;
let currentPathname = '/';

export type NavigateOptions = {
  history?: 'push' | 'replace';
};

function parseTargetUrl(path: string): URL {
  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const href =
    typeof window.location.href === 'string' ? window.location.href : '';
  const base =
    href &&
    href !== 'about:blank' &&
    !href.startsWith('about:') &&
    !href.startsWith('data:')
      ? href
      : `http://localhost${pathname}${search}${hash}`;

  return new URL(path, base);
}

function isRenderResult(
  result: RouteRequestResult
): result is RouteRenderResult {
  return result !== null && result.kind === 'render';
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value instanceof Promise;
}

function createDeniedResolvedRoute(status: number): ResolvedRoute {
  return {
    handler: () => ({
      type: 'div',
      props: {
        'data-route-denied': String(status),
      },
      children: [String(status)],
    }),
    params: {},
  };
}

function remountResolvedRoute(
  resolved: ResolvedRoute,
  pathname: string
): boolean {
  if (!currentInstance) {
    return false;
  }

  // Cleanup previous route lifecycle, but keep the host node so the next route
  // can reconcile against the existing DOM and preserve shared layout shells.
  cleanupComponent(currentInstance);

  // The route handler IS the component function
  // It takes params as props and renders the route
  currentInstance.fn = resolved.handler as ComponentInstance['fn'];
  currentInstance.props = resolved.params;

  // Reset state to prevent leakage from previous route
  // Each route navigation starts completely fresh
  currentInstance.stateValues = [];
  currentInstance.expectedStateIndices = [];
  currentInstance.firstRenderComplete = false;
  currentInstance.stateIndexCheck = -1;
  // Increment generation to invalidate pending async evaluations from previous route
  currentInstance.evaluationGeneration++;
  currentInstance.notifyUpdate = null;
  currentInstance.mountOperations = [];
  currentInstance._placeholder = undefined;
  currentInstance.hasPendingUpdate = false;

  // Route-local async work should create a fresh abort controller lazily.
  currentInstance.abortController = null;

  // Re-execute component against the existing host so reconciliation can
  // preserve any shared layout DOM between sibling routes.
  mountComponent(currentInstance);
  currentPathname = pathname;
  return true;
}

function rerenderResolvedRoute(pathname: string): boolean {
  if (!currentInstance) {
    return false;
  }

  const resolved = resolveRoute(pathname);
  if (!resolved) {
    return false;
  }

  currentPathname = pathname;
  currentInstance._enqueueRun?.();
  return true;
}

function resolveNavigationTarget(path: string) {
  const target = parseTargetUrl(path);
  const pathname = target.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;
  const resolved = resolveRouteRequest(href);

  if (isPromise(resolved)) {
    return resolved.then((next) => ({
      href,
      pathname,
      resolved: next,
    }));
  }

  return {
    href,
    pathname,
    resolved,
  };
}

function applyNavigationTarget(
  path: string,
  options: NavigateOptions,
  target: {
    href: string;
    pathname: string;
    resolved: RouteRequestResult;
  }
): void {
  const { href, pathname, resolved } = target;

  if (!resolved) {
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  if (resolved.kind === 'redirect') {
    const redirectTarget = parseTargetUrl(resolved.to);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    if (redirectHref === href) {
      if (isDevelopmentEnvironment()) {
        logger.warn(
          `Navigation guard redirected to the same path: ${redirectHref}`
        );
      }
      return;
    }

    navigate(redirectHref, { history: 'replace' });
    return;
  }

  const nextResolved =
    resolved.kind === 'deny'
      ? createDeniedResolvedRoute(resolved.status)
      : {
          handler: resolved.handler,
          params: resolved.params,
        };

  const historyMethod =
    options.history === 'replace' ? 'replaceState' : 'pushState';
  window.history[historyMethod]({ path: href }, '', href);

  if (currentInstance) {
    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname);
      return;
    }

    remountResolvedRoute(nextResolved, pathname);
  }
}

/** Register the current app instance (called by createSPA/hydrateSPA). */
export function registerAppInstance(
  instance: ComponentInstance,
  path: string
): void {
  currentInstance = instance;
  currentPathname = path;
  // Lock further route registrations after the app has started — but allow tests to register routes.
  // Enforce only in production to avoid breaking test infra which registers routes dynamically.
  if (isProductionEnvironment()) {
    lockRouteRegistration();
  }
}

/**
 * Navigate to a new path
 * Updates URL, resolves route, and re-mounts app with new handler
 */
export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') {
    // SSR context
    return;
  }

  const target = resolveNavigationTarget(path);
  if (isPromise(target)) {
    void target.then((resolvedTarget) =>
      applyNavigationTarget(path, options, resolvedTarget)
    );
    return;
  }

  applyNavigationTarget(path, options, target);
}

/**
 * Handle browser back/forward buttons
 */
function handlePopState(_event: PopStateEvent): void {
  const pathname = window.location.pathname;
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (!currentInstance) {
    return;
  }

  const resolved = resolveRouteRequest(href);

  const applyResolved = (resolved: RouteRequestResult) => {
    if (!resolved) {
      if (isDevelopmentEnvironment()) {
        logger.warn(`No route found for path: ${pathname}`);
      }
      return;
    }

    if (resolved.kind === 'redirect') {
      navigate(resolved.to, { history: 'replace' });
      return;
    }

    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname);
      return;
    }

    remountResolvedRoute(
      resolved.kind === 'deny'
        ? createDeniedResolvedRoute(resolved.status)
        : {
            handler: resolved.handler,
            params: resolved.params,
          },
      pathname
    );
  };

  if (isPromise(resolved)) {
    void resolved.then((next) => applyResolved(next));
    return;
  }

  applyResolved(resolved);
}

/**
 * Setup popstate listener for browser navigation
 */
export function initializeNavigation(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', handlePopState);
  }
}

/**
 * Cleanup navigation listeners
 */
export function cleanupNavigation(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('popstate', handlePopState);
  }
}
