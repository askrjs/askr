/**
 * Client-side navigation with History API
 */

import {
  resolveRoute,
  resolveRouteWithGuards,
  lockRouteRegistration,
  type ResolvedRoute,
} from './route';
import {
  mountComponent,
  cleanupComponent,
  type ComponentInstance,
} from '../runtime/component';
import { teardownNodeSubtree } from '../renderer';
import { logger } from '../dev/logger';

// Global app state for navigation
let currentInstance: ComponentInstance | null = null;
let currentPathname = '/';

export type NavigateOptions = {
  history?: 'push' | 'replace';
};

function parseTargetUrl(path: string): URL {
  return new URL(path, window.location.href);
}

function isRedirectResult(
  result: ResolvedRoute | { redirect: string } | null
): result is { redirect: string } {
  return result !== null && 'redirect' in result;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value instanceof Promise;
}

function remountResolvedRoute(
  resolved: ResolvedRoute,
  pathname: string
): boolean {
  if (!currentInstance) {
    return false;
  }

  const target = currentInstance.target;

  // Cleanup previous route (abort pending operations)
  cleanupComponent(currentInstance);

  if (target) {
    const previousChildren = Array.from(target.childNodes);
    for (const child of previousChildren) {
      if (child instanceof Element) {
        teardownNodeSubtree(child);
      }
    }
    target.replaceChildren();
  }

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

  // Create new AbortController for the new route lifecycle.
  currentInstance.abortController = new AbortController();

  // Re-execute and re-mount component
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
  const resolved = resolveRouteWithGuards(pathname);

  if (isPromise(resolved)) {
    return resolved.then((next) => ({ href, pathname, resolved: next }));
  }

  return { href, pathname, resolved };
}

function applyNavigationTarget(
  path: string,
  options: NavigateOptions,
  target: {
    href: string;
    pathname: string;
    resolved: ResolvedRoute | { redirect: string } | null;
  }
): void {
  const { href, pathname, resolved } = target;

  if (!resolved) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  if (isRedirectResult(resolved)) {
    const redirectTarget = parseTargetUrl(resolved.redirect);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    if (redirectHref === href) {
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(
          `Navigation guard redirected to the same path: ${redirectHref}`
        );
      }
      return;
    }

    navigate(redirectHref, { history: 'replace' });
    return;
  }

  const historyMethod =
    options.history === 'replace' ? 'replaceState' : 'pushState';
  window.history[historyMethod]({ path: href }, '', href);

  if (currentInstance) {
    if (pathname === currentPathname) {
      rerenderResolvedRoute(pathname);
      return;
    }

    remountResolvedRoute(resolved, pathname);
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
  if (process.env.NODE_ENV === 'production') {
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

  if (!currentInstance) {
    return;
  }

  const resolved = resolveRouteWithGuards(pathname);
  if (isPromise(resolved)) {
    void resolved.then((next) => {
      if (!next) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn(`No route found for path: ${pathname}`);
        }
        return;
      }

      if (isRedirectResult(next)) {
        navigate(next.redirect, { history: 'replace' });
        return;
      }

      if (pathname === currentPathname) {
        rerenderResolvedRoute(pathname);
        return;
      }

      remountResolvedRoute(next, pathname);
    });
    return;
  }

  if (!resolved) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`No route found for path: ${pathname}`);
    }
    return;
  }

  if (isRedirectResult(resolved)) {
    navigate(resolved.redirect, { history: 'replace' });
    return;
  }

  if (pathname === currentPathname) {
    rerenderResolvedRoute(pathname);
    return;
  }

  remountResolvedRoute(resolved, pathname);
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
