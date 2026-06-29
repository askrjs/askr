/**
 * Client-side navigation with History API
 */

import {
  computeRouteActivityMatches,
  resolveRouteRequest,
  resolveRouteFromRoutes,
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
import type {
  Route,
  RouteAuthOptions,
  RouteManifest,
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import { Fragment, ELEMENT_TYPE } from '../jsx';
import {
  DefaultPortal,
  clearDefaultPortalForInstance,
} from '../foundations/structures/portal';
import { isPromiseLike } from '../common/promise';
import { cleanupInstancesUnder } from '../renderer/cleanup';

// Global app state for navigation
let currentInstance: ComponentInstance | null = null;
let currentPathname = '/';
let currentHref = '/';
let navigationInitialized = false;
let activeRouteRequestId = 0;
let activeRouteRequestController: AbortController | null = null;
const MAX_NAVIGATION_REDIRECTS = 20;

type AppNavigationSource = {
  manifest?: RouteManifest;
  routes?: readonly Route[];
  auth?: RouteAuthOptions;
};

type AppRegistration = AppNavigationSource & {
  instance: ComponentInstance;
  pathname: string;
  href: string;
};

const registeredApps: AppRegistration[] = [];

function collectRouteActivityMatches(
  pathname: string,
  apps: readonly AppRegistration[] = registeredApps
) {
  const matches: ReturnType<typeof computeRouteActivityMatches> = [];
  const seenPaths = new Set<string>();

  for (const app of apps) {
    const appMatches = computeRouteActivityMatches(pathname, {
      manifest: app.manifest,
      routes: app.routes,
    });

    for (const match of appMatches) {
      if (seenPaths.has(match.path)) {
        continue;
      }
      seenPaths.add(match.path);
      matches.push(match);
    }
  }

  return matches;
}

function syncRegisteredRouteSnapshot(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const pathname = window.location.pathname || '/';
  syncCurrentRouteSnapshot(
    pathname,
    window.location.search || '',
    window.location.hash || '',
    collectRouteActivityMatches(pathname)
  );
}

function syncAppRegistrationLocation(
  app: AppRegistration,
  pathname: string,
  href: string
): void {
  app.pathname = pathname;
  app.href = href;
}

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

export type RouteQueryParamValue = string | number | boolean | null | undefined;
export type RouteQueryParamInput =
  | RouteQueryParamValue
  | readonly RouteQueryParamValue[];
export type RouteQueryUpdates = Record<string, RouteQueryParamInput>;
export type RouteQueryUpdater = (searchParams: URLSearchParams) => void;

export type UpdateRouteQueryOptions = {
  /**
   * Defaults to replace so high-frequency controls such as search inputs do not
   * create one browser-history entry per character.
   */
  history?: 'push' | 'replace';
  replace?: boolean;
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

function getRouteQueryHistoryMode(
  options: UpdateRouteQueryOptions
): 'push' | 'replace' {
  if (options.history) {
    return options.history;
  }

  return options.replace === false ? 'push' : 'replace';
}

function setRouteQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: RouteQueryParamInput
): void {
  searchParams.delete(key);

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === null || entry === undefined) {
        continue;
      }
      searchParams.append(key, String(entry));
    }
    return;
  }

  if (value === null || value === undefined) {
    return;
  }

  searchParams.set(key, String(value));
}

function applyRouteQueryUpdates(
  searchParams: URLSearchParams,
  updates: RouteQueryUpdates | RouteQueryUpdater
): void {
  if (typeof updates === 'function') {
    updates(searchParams);
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    setRouteQueryValue(searchParams, key, value);
  }
}

/**
 * Update the current URL query string without resolving or remounting the
 * route. This is intended for route-local view state such as filters, search,
 * tabs, and pagination.
 */
export function updateRouteQuery(
  updates: RouteQueryUpdates | RouteQueryUpdater,
  options: UpdateRouteQueryOptions = {}
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const url = parseTargetUrl(getWindowHref());
  applyRouteQueryUpdates(url.searchParams, updates);

  const href = `${url.pathname}${url.search}${url.hash}`;
  if (href === getWindowHref()) {
    return;
  }

  const historyMode = getRouteQueryHistoryMode(options);
  if (historyMode === 'push') {
    saveScrollPosition(currentHref);
  }

  const state =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};

  window.history[historyMode === 'replace' ? 'replaceState' : 'pushState'](
    {
      ...state,
      path: href,
    },
    '',
    href
  );

  currentPathname = url.pathname;
  currentHref = href;
  for (const app of registeredApps) {
    syncAppRegistrationLocation(app, url.pathname, href);
  }
  syncRegisteredRouteSnapshot();
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

function cleanupRouteOwnership(instance: ComponentInstance): void {
  const cleanupErrors: unknown[] = [];
  const children = instance.target
    ? Array.from(instance.target.childNodes)
    : [];

  for (const child of children) {
    try {
      cleanupInstancesUnder(child, { strict: instance.cleanupStrict });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  try {
    cleanupComponent(instance);
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Route cleanup failed');
  }
}

function remountResolvedRoute(
  instance: ComponentInstance,
  resolved: ResolvedRoute,
  pathname: string,
  href: string
): boolean {
  // The route handler IS the component function
  // It takes params as props and renders the route
  clearDefaultPortalForInstance(instance);
  cleanupRouteOwnership(instance);

  instance.fn = wrapRootRouteHandler(bindResolvedRouteHandler(resolved));
  instance.props = {};

  // Reset state to prevent leakage from previous route
  // Each route navigation starts completely fresh
  instance.stateValues = [];
  instance.expectedStateIndices = [];
  instance.firstRenderComplete = false;
  instance.stateIndexCheck = -1;
  // Increment generation to invalidate pending async evaluations from previous route
  instance.evaluationGeneration++;
  instance.notifyUpdate = null;
  instance.mountOperations = [];
  instance.commitOperations = [];
  instance.lifecycleSlots = [];
  instance.cleanupFns = [];
  instance._placeholder = undefined;
  instance.hasPendingUpdate = false;
  instance._currentRenderToken = undefined;
  instance.lastRenderToken = 0;
  instance._pendingReadSources = undefined;
  instance._lastReadSources = undefined;

  // Route-local async work should create a fresh abort controller lazily.
  instance.abortController = null;

  // Re-execute component against the existing host so reconciliation can
  // preserve any shared layout DOM between sibling routes.
  mountComponent(instance);
  currentPathname = pathname;
  currentHref = href;
  return true;
}

function rerenderResolvedRoute(
  instance: ComponentInstance,
  pathname: string,
  href: string
): boolean {
  currentPathname = pathname;
  currentHref = href;
  instance._enqueueRun?.();
  return true;
}

function resolveAppRouteRequest(
  app: AppRegistration,
  pathname: string,
  href: string,
  signal: AbortSignal
): RouteRequestResult | Promise<RouteRequestResult> {
  if (app.manifest) {
    return resolveRouteRequest(href, {
      manifest: app.manifest,
      auth: app.auth,
      signal,
    });
  }

  if (app.routes) {
    const resolved = resolveRouteFromRoutes(pathname, app.routes);
    if (!resolved) {
      return null;
    }

    return {
      kind: 'render',
      handler: resolved.handler,
      params: resolved.params,
    };
  }

  return resolveRouteRequest(href, {
    auth: app.auth,
    signal,
  });
}

type AppNavigationTarget = {
  app: AppRegistration;
  resolved: RouteRequestResult;
};

function resolveNavigationTargetsForApps(
  pathname: string,
  href: string,
  signal: AbortSignal
): AppNavigationTarget[] | Promise<AppNavigationTarget[]> {
  const apps = [...registeredApps];

  if (apps.length === 1) {
    const app = apps[0]!;
    const resolved = resolveAppRouteRequest(app, pathname, href, signal);
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      return Promise.resolve(resolved).then((next) => [
        {
          app,
          resolved: next,
        },
      ]);
    }

    return [
      {
        app,
        resolved,
      },
    ];
  }

  const syncTargets: AppNavigationTarget[] = [];
  const pendingTargets: Array<Promise<AppNavigationTarget>> = [];

  for (const app of apps) {
    const resolved = resolveAppRouteRequest(app, pathname, href, signal);
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      pendingTargets.push(
        Promise.resolve(resolved).then((next) => ({ app, resolved: next }))
      );
      continue;
    }

    syncTargets.push({ app, resolved });
  }

  if (pendingTargets.length === 0) {
    return syncTargets;
  }

  return Promise.all([
    ...syncTargets.map((target) => Promise.resolve(target)),
    ...pendingTargets,
  ]);
}

function applyNavigationTargets(
  path: string,
  options: NavigateOptions,
  redirectState: NavigationRedirectState,
  pathname: string,
  href: string,
  targets: AppNavigationTarget[]
): void {
  const previousPathname = currentPathname;

  for (const target of targets) {
    const resolved = target.resolved;
    if (!resolved || resolved.kind !== 'redirect') {
      continue;
    }

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

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  saveScrollPosition(currentHref);

  const historyMethod =
    getNavigationHistoryMode(options) === 'replace'
      ? 'replaceState'
      : 'pushState';
  window.history[historyMethod]({ path: href }, '', href);
  syncRegisteredRouteSnapshot();

  for (const target of matchedTargets) {
    const resolved = target.resolved!;
    if (resolved.kind === 'redirect') {
      continue;
    }

    if (pathname === target.app.pathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(target.app.instance, pathname, href);
      syncAppRegistrationLocation(target.app, pathname, href);
      continue;
    }

    remountResolvedRoute(
      target.app.instance,
      resolved.kind === 'deny'
        ? createDeniedResolvedRoute(resolved.status)
        : {
            handler: resolved.handler,
            params: resolved.params,
          },
      pathname,
      href
    );
    syncAppRegistrationLocation(target.app, pathname, href);
  }

  if (pathname !== previousPathname) {
    applyNavigationScroll(
      options.scroll ?? scrollRestorationOptions.navigation
    );
  }
}

/** Register the current app instance (called by createSPA/hydrateSPA). */
export function registerAppInstance(
  instance: ComponentInstance,
  path: string,
  source: AppNavigationSource = {}
): void {
  const existingIndex = registeredApps.findIndex(
    (app) => app.instance === instance
  );
  const registration: AppRegistration = {
    instance,
    pathname: path,
    href: getWindowHref(),
    ...source,
  };
  if (existingIndex >= 0) {
    registeredApps[existingIndex] = registration;
  } else {
    registeredApps.push(registration);
  }

  currentInstance = instance;
  currentPathname = path;
  currentHref = getWindowHref();
  syncRegisteredRouteSnapshot();
  // Lock further route registrations after the app has started — but allow tests to register routes.
  // Enforce only in production to avoid breaking test infra which registers routes dynamically.
  if (isProductionEnvironment()) {
    lockRouteRegistration();
  }
}

export function unregisterAppInstance(instance: ComponentInstance): void {
  const existingIndex = registeredApps.findIndex(
    (app) => app.instance === instance
  );
  if (existingIndex >= 0) {
    registeredApps.splice(existingIndex, 1);
  }
  syncRegisteredRouteSnapshot();

  if (currentInstance !== instance) {
    return;
  }

  const nextApp =
    registeredApps.length > 0
      ? registeredApps[registeredApps.length - 1]!
      : null;
  currentInstance = nextApp?.instance ?? null;
  if (nextApp) {
    currentPathname = nextApp.pathname;
    currentHref = nextApp.href;
    syncRegisteredRouteSnapshot();
    return;
  }

  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = null;
  currentPathname = '/';
  currentHref = '/';
  if (typeof window === 'undefined') {
    syncCurrentRouteSnapshot('/', '', '', []);
  }
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
            path,
            options,
            redirectState,
            pathname,
            href,
            targets
          );
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

  applyNavigationTargets(
    path,
    options,
    redirectState,
    pathname,
    href,
    resolvedTargets
  );
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

  if (registeredApps.length === 0) {
    return;
  }

  const applyResolved = (targets: AppNavigationTarget[]) => {
    if (isStaleRouteRequest(request.id)) {
      return;
    }

    const matchedTargets = targets.filter((target) => target.resolved !== null);
    if (matchedTargets.length === 0) {
      if (isDevelopmentEnvironment()) {
        logger.warn(`No route found for path: ${pathname}`);
      }
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

    syncRegisteredRouteSnapshot();

    for (const target of matchedTargets) {
      const resolved = target.resolved!;
      if (pathname === target.app.pathname && isRenderResult(resolved)) {
        rerenderResolvedRoute(target.app.instance, pathname, href);
        syncAppRegistrationLocation(target.app, pathname, href);
        continue;
      }

      if (resolved.kind === 'redirect') {
        continue;
      }

      remountResolvedRoute(
        target.app.instance,
        resolved.kind === 'deny'
          ? createDeniedResolvedRoute(resolved.status)
          : {
              handler: resolved.handler,
              params: resolved.params,
            },
        pathname,
        href
      );
      syncAppRegistrationLocation(target.app, pathname, href);
    }

    applyHistoryScroll(href, _event.state);
  };

  const resolvedTargets = resolveNavigationTargetsForApps(
    pathname,
    href,
    request.signal
  );

  if (isPromiseLike<AppNavigationTarget[]>(resolvedTargets)) {
    void Promise.resolve(resolvedTargets).then(
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

  applyResolved(resolvedTargets);
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
