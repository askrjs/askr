import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import type {
  RouteMeta,
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import { logger } from '../common/logger';
import {
  beginCommitTransaction,
  discardTransaction,
  commitTransaction,
  flushRuntimeScheduler,
} from '../runtime';
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
import { resolveRouteRequest, type ResolvedRoute } from './route';
import {
  getRouteRenderContext,
  getRouteRenderData,
  hasRouteRenderData,
} from './resolution';
import { reconcileRouteMeta, resolveRouteMeta } from './metadata';
import {
  prepareRootUpdate,
  type PreparedRootUpdate,
} from '../common/root-update';
import type { ComponentFunction } from '../common/component';
import { registerCommitParticipant } from '../runtime/transactions/access';

/** Options for {@link navigate}. */
export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
  /** Entry-local browser history state. It is not serialized into the URL or sent to the server. */
  state?: unknown;
};

export type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
};

export type AppNavigationTarget = {
  app: AppRegistration;
  resolved: RouteRequestResult;
  metadata?: Readonly<RouteMeta>;
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

function createNavigationTarget(
  app: AppRegistration,
  resolved: RouteRequestResult
): AppNavigationTarget | Promise<AppNavigationTarget> {
  if (!isRenderResult(resolved) || !resolved.record) return { app, resolved };
  const hasMetadata = Boolean(
    resolved.record.options.title ||
    resolved.record.options.meta ||
    resolved.record.metaChain?.length
  );
  if (!hasMetadata) return { app, resolved };
  const context = getRouteRenderContext(resolved);
  if (!context) return { app, resolved };
  return resolveRouteMeta(resolved.record, context).then((metadata) => ({
    app,
    resolved,
    metadata,
  }));
}

function reconcileNavigationMetadata(
  targets: readonly AppNavigationTarget[]
): void {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const metadata = targets[index]?.metadata;
    if (metadata) {
      reconcileRouteMeta(metadata);
      return;
    }
  }
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

function bindResolvedRouteHandler(resolved: ResolvedRoute): ComponentFunction {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentFunction>;
}

function flattenLifecycleErrors(error: unknown, result: unknown[]): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      flattenLifecycleErrors(nested, result);
    }
    return;
  }

  result.push(error);
}

function reportRouteCleanupErrors(errors: unknown[]): void {
  for (const error of errors) {
    const flattened: unknown[] = [];
    flattenLifecycleErrors(error, flattened);
    for (const cleanupError of flattened.length > 0 ? flattened : [error]) {
      logger.error('[Askr] route cleanup failed:', cleanupError);
    }
  }
}

function resolveAppRouteRequest(
  app: AppRegistration,
  pathname: string,
  href: string,
  signal: AbortSignal
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveRouteRequest(href, {
    registry: app.registry,
    auth: app.auth,
    signal,
  });
}

function getResolvedRouteHandler(resolved: RouteRequestResult): ResolvedRoute {
  if (!resolved) {
    throw new Error('[Askr] cannot prepare an unmatched navigation target');
  }
  if (resolved.kind === 'deny') {
    return createDeniedResolvedRoute(resolved.status);
  }
  if (!isRenderResult(resolved)) {
    throw new Error('[Askr] cannot prepare a redirect as a destination root');
  }
  return {
    handler: resolved.handler,
    params: resolved.params,
  };
}

function prepareNavigationRoot(
  target: AppNavigationTarget,
  href: string,
  replaceLifetime: boolean
): PreparedRootUpdate {
  const resolved = target.resolved;
  return prepareRootUpdate(target.app.instance, {
    handler: bindResolvedRouteHandler(getResolvedRouteHandler(resolved)),
    href,
    routeData: isRenderResult(resolved)
      ? getRouteRenderData(resolved)
      : undefined,
    hasRouteData: isRenderResult(resolved) && hasRouteRenderData(resolved),
    replaceLifetime,
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
      return Promise.resolve(resolved).then((next) => {
        const target = createNavigationTarget(app, next);
        return isPromiseLike(target)
          ? Promise.resolve(target).then((ready) => [ready])
          : [target];
      });
    }
    const target = createNavigationTarget(app, resolved);
    return isPromiseLike(target)
      ? Promise.resolve(target).then((next) => [next])
      : [target];
  }

  const syncTargets: AppNavigationTarget[] = [];
  const pendingTargets: Array<Promise<AppNavigationTarget>> = [];

  for (const app of apps) {
    const resolved = resolveAppRouteRequest(app, pathname, href, signal);
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      pendingTargets.push(
        Promise.resolve(resolved).then((next) =>
          createNavigationTarget(app, next)
        )
      );
      continue;
    }
    const target = createNavigationTarget(app, resolved);
    if (isPromiseLike(target)) pendingTargets.push(Promise.resolve(target));
    else syncTargets.push(target);
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
  requestId: number,
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
  if (isStaleRouteRequest(requestId)) {
    return;
  }
  const previousPathname = getCurrentPathname();
  const previousHref = getCurrentHref();

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

  if (isStaleRouteRequest(requestId)) {
    return;
  }

  commitNavigationRoots(
    requestId,
    pathname,
    href,
    matchedTargets,
    () => {
      saveScrollPosition(previousHref);
      const historyMethod =
        getNavigationHistoryMode(options) === 'replace'
          ? 'replaceState'
          : 'pushState';
      window.history[historyMethod](
        {
          path: href,
          askrHasState: Object.prototype.hasOwnProperty.call(options, 'state'),
          askrState: options.state,
        },
        '',
        href
      );
    },
    () => {
      if (pathname !== previousPathname || parseTargetUrl(href).hash)
        applyNavigationScroll(options.scroll);
    }
  );
}

export function applyPopStateNavigationTargets(
  requestId: number,
  previousHref: string,
  previousState: unknown,
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

  saveScrollPosition(previousHref);
  commitNavigationRoots(
    requestId,
    pathname,
    href,
    matchedTargets,
    () => {},
    () => applyHistoryScroll(href, state),
    () => {
      window.history.replaceState(previousState, '', previousHref);
      syncRegisteredRouteSnapshot();
    }
  );
}

/** Every root joins one transaction. History remains after lifecycle work,
 * so a navigation started by that work can supersede this destination. */
function commitNavigationRoots(
  requestId: number,
  pathname: string,
  href: string,
  targets: AppNavigationTarget[],
  updateHistory: () => void,
  updateScroll: () => void,
  restoreHistory?: () => void
): void {
  const previousPathname = getCurrentPathname();
  const previousHref = getCurrentHref();
  const roots = targets.map((target) => {
    const replaceLifetime =
      pathname !== target.app.pathname || !isRenderResult(target.resolved);
    return {
      target,
      replaceLifetime,
      previousPathname: target.app.pathname,
      previousHref: target.app.href,
      prepared: prepareNavigationRoot(target, href, replaceLifetime),
    };
  });
  const transaction = beginCommitTransaction();
  let completionFailure: { error: unknown } | undefined;
  registerCommitParticipant({
    rollback() {
      const errors: unknown[] = [];
      for (let index = roots.length - 1; index >= 0; index--)
        errors.push(...roots[index]!.prepared.rollback());
      for (const root of roots) {
        root.target.app.pathname = root.previousPathname;
        root.target.app.href = root.previousHref;
      }
      setCurrentRouteLocation(previousPathname, previousHref);
      try {
        restoreHistory?.();
      } catch (error) {
        errors.push(error);
      }
      reportRouteCleanupErrors(errors);
    },
    settle() {
      const errors: unknown[] = [];
      for (const root of roots) errors.push(...root.prepared.retire());
      reportRouteCleanupErrors(errors);
    },
    complete() {
      try {
        if (isStaleRouteRequest(requestId)) return;
        updateHistory();
        setCurrentRouteLocation(pathname, href);
        for (const root of roots) root.prepared.publish();
        syncRegisteredRouteSnapshot();
        reconcileNavigationMetadata(targets);
        updateScroll();
      } catch (error) {
        completionFailure = { error };
        throw error;
      } finally {
        for (const root of roots) root.prepared.publish();
      }
    },
  });
  try {
    // Preserve replacement-before-refresh scheduling across all roots.
    for (const replaceLifetime of [true, false]) {
      for (const root of roots) {
        if (isStaleRouteRequest(requestId)) return;
        if (root.replaceLifetime === replaceLifetime) root.prepared.apply();
      }
      if (isStaleRouteRequest(requestId)) return;
      flushRuntimeScheduler();
      if (isStaleRouteRequest(requestId)) return;
    }
    registerCommitParticipant({
      publish() {
        for (const root of roots)
          syncAppRegistrationLocation(root.target.app, pathname, href);
      },
    });
    commitTransaction(transaction);
    if (completionFailure) throw completionFailure.error;
  } catch (error) {
    logger.error('[Askr] navigation failed:', error);
    throw error;
  } finally {
    discardTransaction(transaction);
  }
}
