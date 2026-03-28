/**
 * Client-side navigation with History API
 */

import { resolveRoute, lockRouteRegistration } from './route';
import {
  mountComponent,
  cleanupComponent,
  type ComponentInstance,
} from '../runtime/component';
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

function remountResolvedRoute(pathname: string): boolean {
  if (!currentInstance) {
    return false;
  }

  const resolved = resolveRoute(pathname);
  if (!resolved) {
    return false;
  }

  // Cleanup previous route (abort pending operations)
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

  const target = parseTargetUrl(path);
  const pathname = target.pathname;

  // Resolve the new path to a route
  const resolved = resolveRoute(pathname);

  if (!resolved) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  // Update browser history
  const historyMethod =
    options.history === 'replace' ? 'replaceState' : 'pushState';
  const href = `${target.pathname}${target.search}${target.hash}`;
  window.history[historyMethod]({ path: href }, '', href);

  // Query/hash-only updates should preserve route component state and focus.
  if (currentInstance) {
    if (pathname === currentPathname) {
      rerenderResolvedRoute(pathname);
      return;
    }

    remountResolvedRoute(pathname);
  }
}

/**
 * Handle browser back/forward buttons
 */
function handlePopState(_event: PopStateEvent): void {
  const pathname = window.location.pathname;

  if (!currentInstance) {
    return;
  }

  if (pathname === currentPathname) {
    rerenderResolvedRoute(pathname);
    return;
  }

  if (
    !remountResolvedRoute(pathname) &&
    process.env.NODE_ENV !== 'production'
  ) {
    logger.warn(`No route found for path: ${pathname}`);
  }
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
