import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import type {
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import {
  DefaultPortal,
  clearDefaultPortalForInstance,
} from '../foundations/structures/portal';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import { logger } from '../dev/logger';
import { cleanupInstancesUnder } from '../renderer/cleanup';
import {
  cleanupComponent,
  mountComponent,
  type ComponentInstance,
} from '../runtime/component';
import {
  applyHistoryScroll,
  applyNavigationScroll,
  saveScrollPosition,
  type NavigationScrollBehavior,
} from './navigation-scroll';
import {
  getCurrentHref,
  getCurrentPathname,
  getRegisteredAppsSnapshot,
  parseTargetUrl,
  setCurrentRouteLocation,
  syncAppRegistrationLocation,
  syncRegisteredRouteSnapshot,
  type AppRegistration,
} from './navigation-registry';
import {
  resolveRouteFromRoutes,
  resolveRouteRequest,
  type ResolvedRoute,
} from './route';

export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
};

export type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
};

export type AppNavigationTarget = {
  app: AppRegistration;
  resolved: RouteRequestResult;
};

const MAX_NAVIGATION_REDIRECTS = 20;

let activeRouteRequestId = 0;
let activeRouteRequestController: AbortController | null = null;

export function beginRouteRequest(): { id: number; signal: AbortSignal } {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = new AbortController();

  return {
    id: activeRouteRequestId,
    signal: activeRouteRequestController.signal,
  };
}

export function isStaleRouteRequest(requestId: number): boolean {
  return requestId !== activeRouteRequestId;
}

export function cancelRouteRequests(): void {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = null;
}

function isRenderResult(
  result: RouteRequestResult
): result is RouteRenderResult {
  return result !== null && result.kind === 'render';
}

export function getRedirectHistoryMode(
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
  clearDefaultPortalForInstance(instance);
  cleanupRouteOwnership(instance);

  instance.fn = wrapRootRouteHandler(bindResolvedRouteHandler(resolved));
  instance.props = {};

  instance.stateValues = [];
  instance.expectedStateIndices = [];
  instance.firstRenderComplete = false;
  instance.stateIndexCheck = -1;
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

  instance.abortController = null;

  mountComponent(instance);
  setCurrentRouteLocation(pathname, href);
  return true;
}

function rerenderResolvedRoute(
  instance: ComponentInstance,
  pathname: string,
  href: string
): boolean {
  setCurrentRouteLocation(pathname, href);
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

export function resolveNavigationTargetsForApps(
  pathname: string,
  href: string,
  signal: AbortSignal
): AppNavigationTarget[] | Promise<AppNavigationTarget[]> {
  const apps = getRegisteredAppsSnapshot();

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

export function applyNavigationTargets(
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
  const previousPathname = getCurrentPathname();

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

  saveScrollPosition(getCurrentHref());

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
    applyNavigationScroll(options.scroll);
  }
}

export function applyPopStateNavigationTargets(
  requestId: number,
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

  applyHistoryScroll(href, state);
}
