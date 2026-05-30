/**
 * Client-side navigation with History API
 */

import {
  resolveRoute,
  resolveRouteRequest,
  lockRouteRegistration,
  syncCurrentRouteSnapshot,
  type ResolvedRoute,
} from './route';
import {
  cleanupComponent,
  mountComponent,
  type ComponentInstance,
} from '../runtime/component';
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../common/env';
import { logger } from '../dev/logger';
import type { RouteRenderResult, RouteRequestResult } from '../common/router';
import { Fragment, ELEMENT_TYPE } from '../jsx';
import { DefaultPortal } from '../foundations/structures/portal';
import { isPromiseLike } from '../common/promise';

// Global app state for navigation
let currentInstance: ComponentInstance | null = null;
let currentPathname = '/';
let currentHref = '/';
let navigationInitialized = false;
let activeRouteRequestId = 0;
let activeRouteRequestController: AbortController | null = null;
const MAX_NAVIGATION_REDIRECTS = 20;

export type NavigationScrollBehavior = 'top' | 'preserve';
export type HistoryScrollBehavior = 'restore' | 'top' | 'preserve';

export type ScrollRestorationOptions = {
  navigation?: NavigationScrollBehavior;
  history?: HistoryScrollBehavior;
};

type NormalizedScrollRestorationOptions = {
  enabled: boolean;
  navigation: NavigationScrollBehavior;
  history: HistoryScrollBehavior;
};

const DEFAULT_SCROLL_RESTORATION: NormalizedScrollRestorationOptions = {
  enabled: true,
  navigation: 'top',
  history: 'restore',
};

let scrollRestorationOptions: NormalizedScrollRestorationOptions = {
  ...DEFAULT_SCROLL_RESTORATION,
};

const scrollPositions = new Map<string, { x: number; y: number }>();

export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
};

function getWindowHref(): string {
  if (typeof window === 'undefined') {
    return currentHref;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeScrollRestorationOptions(
  options?: boolean | ScrollRestorationOptions
): NormalizedScrollRestorationOptions {
  if (options === false) {
    return {
      enabled: false,
      navigation: DEFAULT_SCROLL_RESTORATION.navigation,
      history: DEFAULT_SCROLL_RESTORATION.history,
    };
  }

  if (options === true || options === undefined) {
    return { ...DEFAULT_SCROLL_RESTORATION };
  }

  return {
    enabled: true,
    navigation: options.navigation ?? DEFAULT_SCROLL_RESTORATION.navigation,
    history: options.history ?? DEFAULT_SCROLL_RESTORATION.history,
  };
}

function readScrollPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }

  const x =
    typeof window.scrollX === 'number'
      ? window.scrollX
      : typeof window.pageXOffset === 'number'
        ? window.pageXOffset
        : 0;
  const y =
    typeof window.scrollY === 'number'
      ? window.scrollY
      : typeof window.pageYOffset === 'number'
        ? window.pageYOffset
        : 0;

  return { x, y };
}

function writeHistoryScrollPosition(
  href: string,
  position: { x: number; y: number }
): void {
  if (typeof window === 'undefined' || getWindowHref() !== href) {
    return;
  }
  if (typeof window.history?.replaceState !== 'function') {
    return;
  }
  const state =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};

  window.history.replaceState(
    {
      ...state,
      path: href,
      scroll: position,
    },
    '',
    href
  );
}

function saveScrollPosition(href: string): void {
  if (!scrollRestorationOptions.enabled || typeof window === 'undefined') {
    return;
  }

  const position = readScrollPosition();
  scrollPositions.set(href, position);
  writeHistoryScrollPosition(href, position);
}

function scrollToPosition(position: { x: number; y: number }): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') {
    return;
  }

  window.scrollTo(position.x, position.y);
}

function applyNavigationScroll(behavior: NavigationScrollBehavior): void {
  if (!scrollRestorationOptions.enabled || behavior === 'preserve') {
    return;
  }

  scrollToPosition({ x: 0, y: 0 });
}

function applyHistoryScroll(href: string, state: PopStateEvent['state']): void {
  if (!scrollRestorationOptions.enabled) {
    return;
  }

  if (scrollRestorationOptions.history === 'preserve') {
    return;
  }

  if (scrollRestorationOptions.history === 'top') {
    scrollToPosition({ x: 0, y: 0 });
    return;
  }

  const fromState =
    state && typeof state === 'object' && 'scroll' in state
      ? (state.scroll as { x?: unknown; y?: unknown })
      : undefined;
  const saved =
    fromState &&
    typeof fromState.x === 'number' &&
    typeof fromState.y === 'number'
      ? { x: fromState.x, y: fromState.y }
      : scrollPositions.get(href);

  scrollToPosition(saved ?? { x: 0, y: 0 });
}

export function configureScrollRestoration(
  options?: boolean | ScrollRestorationOptions
): void {
  scrollRestorationOptions = normalizeScrollRestorationOptions(options);

  if (typeof window === 'undefined') {
    return;
  }

  if ('scrollRestoration' in window.history) {
    try {
      window.history.scrollRestoration = scrollRestorationOptions.enabled
        ? 'manual'
        : 'auto';
    } catch {
      // Ignore environments that expose but do not allow setting scrollRestoration.
    }
  }
}

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

function getRedirectHistoryMode(
  replace: boolean | undefined
): 'push' | 'replace' {
  return replace === false ? 'push' : 'replace';
}

function getNavigationHistoryMode(
  options: NavigateOptions
): 'push' | 'replace' {
  if (options.history) {
    return options.history;
  }

  return options.replace ? 'replace' : 'push';
}

function beginRouteRequest(): { id: number; signal: AbortSignal } {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = new AbortController();

  return {
    id: activeRouteRequestId,
    signal: activeRouteRequestController.signal,
  };
}

function isStaleRouteRequest(requestId: number): boolean {
  return requestId !== activeRouteRequestId;
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

function bindResolvedRouteHandler(
  resolved: ResolvedRoute
): ComponentInstance['fn'] {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentInstance['fn']>;
}

function wrapRootRouteHandler(
  componentFn: ComponentInstance['fn']
): ComponentInstance['fn'] {
  const wrappedFn: ComponentInstance['fn'] = (props, ctx) => {
    const out = componentFn(props, ctx);
    if (isPromiseLike(out)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: DefaultPortal,
      props: {},
      key: '__default_portal',
    } as unknown;

    return {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as ReturnType<ComponentInstance['fn']>;
  };

  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'Component',
  });

  return wrappedFn;
}

function remountResolvedRoute(
  resolved: ResolvedRoute,
  pathname: string,
  href: string
): boolean {
  if (!currentInstance) {
    return false;
  }

  // The route handler IS the component function
  // It takes params as props and renders the route
  cleanupComponent(currentInstance);

  currentInstance.fn = wrapRootRouteHandler(bindResolvedRouteHandler(resolved));
  currentInstance.props = {};

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
  currentInstance.cleanupFns = [];
  currentInstance._placeholder = undefined;
  currentInstance.hasPendingUpdate = false;
  currentInstance._currentRenderToken = undefined;
  currentInstance.lastRenderToken = 0;
  currentInstance._pendingReadSources = undefined;
  currentInstance._lastReadSources = undefined;

  // Route-local async work should create a fresh abort controller lazily.
  currentInstance.abortController = null;

  // Re-execute component against the existing host so reconciliation can
  // preserve any shared layout DOM between sibling routes.
  mountComponent(currentInstance);
  currentPathname = pathname;
  currentHref = href;
  return true;
}

function rerenderResolvedRoute(pathname: string, href: string): boolean {
  if (!currentInstance) {
    return false;
  }

  const resolved = resolveRoute(pathname);
  if (!resolved) {
    return false;
  }

  currentPathname = pathname;
  currentHref = href;
  currentInstance._enqueueRun?.();
  return true;
}

function resolveNavigationTarget(path: string, signal?: AbortSignal) {
  const target = parseTargetUrl(path);
  const pathname = target.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;
  const resolved = resolveRouteRequest(href, signal ? { signal } : {});

  if (isPromiseLike<RouteRequestResult>(resolved)) {
    return Promise.resolve(resolved).then((next) => ({
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
  redirectState: NavigationRedirectState,
  target: {
    href: string;
    pathname: string;
    resolved: RouteRequestResult;
  }
): void {
  const { href, pathname, resolved } = target;
  const previousPathname = currentPathname;

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

  const nextResolved =
    resolved.kind === 'deny'
      ? createDeniedResolvedRoute(resolved.status)
      : {
          handler: resolved.handler,
          params: resolved.params,
        };

  saveScrollPosition(currentHref);

  const historyMethod =
    getNavigationHistoryMode(options) === 'replace'
      ? 'replaceState'
      : 'pushState';
  window.history[historyMethod]({ path: href }, '', href);
  syncCurrentRouteSnapshot(
    window.location.pathname,
    window.location.search,
    window.location.hash
  );

  if (currentInstance) {
    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname, href);
      return;
    }

    remountResolvedRoute(nextResolved, pathname, href);
    if (pathname !== previousPathname) {
      applyNavigationScroll(
        options.scroll ?? scrollRestorationOptions.navigation
      );
    }
  }
}

/** Register the current app instance (called by createSPA/hydrateSPA). */
export function registerAppInstance(
  instance: ComponentInstance,
  path: string
): void {
  currentInstance = instance;
  currentPathname = path;
  currentHref = getWindowHref();
  syncCurrentRouteSnapshot(
    window.location.pathname,
    window.location.search,
    window.location.hash
  );
  // Lock further route registrations after the app has started — but allow tests to register routes.
  // Enforce only in production to avoid breaking test infra which registers routes dynamically.
  if (isProductionEnvironment()) {
    lockRouteRegistration();
  }
}

export function unregisterAppInstance(instance: ComponentInstance): void {
  if (currentInstance !== instance) {
    return;
  }

  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = null;
  currentInstance = null;
  currentPathname = '/';
  currentHref = '/';
}

/**
 * Navigate to a new path
 * Updates URL, resolves route, and re-mounts app with new handler
 */
export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  const initialTarget = parseTargetUrl(path);
  navigateWithRedirectState(path, options, {
    redirects: 0,
    visited: new Set([
      `${initialTarget.pathname}${initialTarget.search}${initialTarget.hash}`,
    ]),
  });
}

type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
};

function navigateWithRedirectState(
  path: string,
  options: NavigateOptions,
  redirectState: NavigationRedirectState
): void {
  if (typeof window === 'undefined') {
    // SSR context
    return;
  }

  const request = beginRouteRequest();

  const target = resolveNavigationTarget(path, request.signal);
  if (isPromiseLike(target)) {
    void Promise.resolve(target).then(
      (resolvedTarget) => {
        if (isStaleRouteRequest(request.id)) {
          return;
        }

        try {
          applyNavigationTarget(path, options, redirectState, resolvedTarget);
        } catch (error) {
          logger.error('[Askr] navigation failed:', error);
        }
      },
      (error) => {
        logger.error('[Askr] navigation failed:', error);
      }
    );
    return;
  }

  applyNavigationTarget(path, options, redirectState, target);
}

/**
 * Handle browser back/forward buttons
 */
function handlePopState(_event: PopStateEvent): void {
  const request = beginRouteRequest();
  const previousHref = currentHref;
  const pathname = window.location.pathname;
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  saveScrollPosition(previousHref);

  if (!currentInstance) {
    return;
  }

  const resolved = resolveRouteRequest(href, { signal: request.signal });

  const applyResolved = (resolved: RouteRequestResult) => {
    if (isStaleRouteRequest(request.id)) {
      return;
    }

    if (!resolved) {
      if (isDevelopmentEnvironment()) {
        logger.warn(`No route found for path: ${pathname}`);
      }
      return;
    }

    if (resolved.kind === 'redirect') {
      navigate(resolved.to, {
        history: getRedirectHistoryMode(resolved.replace),
      });
      return;
    }

    syncCurrentRouteSnapshot(
      window.location.pathname,
      window.location.search,
      window.location.hash
    );

    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname, href);
      return;
    }

    remountResolvedRoute(
      resolved.kind === 'deny'
        ? createDeniedResolvedRoute(resolved.status)
        : {
            handler: resolved.handler,
            params: resolved.params,
          },
      pathname,
      href
    );

    applyHistoryScroll(href, _event.state);
  };

  if (isPromiseLike<RouteRequestResult>(resolved)) {
    void Promise.resolve(resolved).then(
      (next) => {
        try {
          applyResolved(next);
        } catch (error) {
          logger.error('[Askr] popstate navigation failed:', error);
        }
      },
      (error) => {
        logger.error('[Askr] popstate navigation failed:', error);
      }
    );
    return;
  }

  applyResolved(resolved);
}

/**
 * Setup popstate listener for browser navigation
 */
export function initializeNavigation(): void {
  if (typeof window === 'undefined' || navigationInitialized) {
    return;
  }

  navigationInitialized = true;
  window.addEventListener('popstate', handlePopState);
}

/**
 * Cleanup navigation listeners
 */
export function cleanupNavigation(): void {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = null;

  if (typeof window === 'undefined' || !navigationInitialized) {
    return;
  }

  navigationInitialized = false;
  window.removeEventListener('popstate', handlePopState);
}
