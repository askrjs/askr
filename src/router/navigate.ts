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

/** Register the current app instance (called by createSPA/hydrateSPA). */
export function registerAppInstance(
  instance: ComponentInstance,
  _path: string
): void {
  currentInstance = instance;
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
export function navigate(path: string): void {
  if (typeof window === 'undefined') {
    // SSR context
    return;
  }

  // Resolve the new path to a route
  const resolved = resolveRoute(path);

  if (!resolved) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  // Update browser history
  window.history.pushState({ path }, '', path);

  // Re-render with the new route handler and params
  if (currentInstance) {
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

    // CRITICAL FIX: Create new AbortController for new route
    // Old controller is already aborted; we need a fresh one for async operations
    currentInstance.abortController = new AbortController();

    // Re-execute and re-mount component
    mountComponent(currentInstance);
  }
}

/**
 * Handle browser back/forward buttons
 */
function handlePopState(_event: PopStateEvent): void {
  const path = window.location.pathname;

  if (!currentInstance) {
    return;
  }

  const resolved = resolveRoute(path);

  if (resolved) {
    // Cleanup old component
    cleanupComponent(currentInstance);

    // The route handler IS the component function
    currentInstance.fn = resolved.handler as ComponentInstance['fn'];
    currentInstance.props = resolved.params;

    // Reset state to prevent leakage from previous route
    currentInstance.stateValues = [];
    currentInstance.expectedStateIndices = [];
    currentInstance.firstRenderComplete = false;
    currentInstance.stateIndexCheck = -1;
    // Increment generation to invalidate pending async evaluations from previous route
    currentInstance.evaluationGeneration++;
    currentInstance.notifyUpdate = null;

    // CRITICAL FIX: Create new AbortController for back/forward navigation
    currentInstance.abortController = new AbortController();

    mountComponent(currentInstance);
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
