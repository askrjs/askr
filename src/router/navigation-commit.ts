import type { RouteRequestResult, ResolvedRoute } from '../common/router';
import type { ComponentFunction } from '../common/component';
import type { AppRenderRouteState } from '../common/app-render-runtime';
import {
  prepareRootUpdate,
  type PreparedRootUpdate,
} from '../common/root-update';
import { logger } from '../common/logger';
import { reportUncaughtErrorLater } from '../common/report-error';
import { flushSync } from '../core/reactive/scheduler';
import {
  getCurrentPathname,
  getCurrentHref,
  setCurrentRouteLocation,
  syncAppRegistrationLocation,
  syncRegisteredRouteSnapshot,
} from './navigation-registry';
import { getRouteRenderData, hasRouteRenderData } from './resolution';
import { reconcileRouteMeta } from './metadata';
import { isStaleRouteRequest } from './navigation-request';
import { isRenderResult, type AppNavigationTarget } from './navigation-types';

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
  replaceLifetime: boolean,
  locationState: AppRenderRouteState
): PreparedRootUpdate {
  const resolved = target.resolved;
  return prepareRootUpdate(target.app.instance, {
    handler: bindResolvedRouteHandler(getResolvedRouteHandler(resolved)),
    href,
    locationState,
    routeData: isRenderResult(resolved)
      ? getRouteRenderData(resolved)
      : undefined,
    hasRouteData: isRenderResult(resolved) && hasRouteRenderData(resolved),
    replaceLifetime,
  });
}

/**
 * Render every destination root, then commit all of them or none. Lifecycle
 * work of the committed destination runs before history is updated, so a
 * navigation it starts supersedes this one.
 */
export function commitNavigationRoots(
  requestId: number,
  pathname: string,
  href: string,
  targets: AppNavigationTarget[],
  locationState: AppRenderRouteState,
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
      prepared: prepareNavigationRoot(
        target,
        href,
        replaceLifetime,
        locationState
      ),
    };
  });

  try {
    const rollback = () => {
      const errors: unknown[] = [];
      for (let index = roots.length - 1; index >= 0; index--) {
        errors.push(...roots[index]!.prepared.rollback());
      }
      setCurrentRouteLocation(previousPathname, previousHref);
      try {
        restoreHistory?.();
      } catch (error) {
        errors.push(error);
      }
      reportRouteCleanupErrors(errors);
    };

    try {
      // Replacement lifetimes render before refreshed ones.
      for (const replaceLifetime of [true, false]) {
        for (const root of roots) {
          if (root.replaceLifetime === replaceLifetime) root.prepared.apply();
        }
      }
    } catch (error) {
      rollback();
      logger.error('[Askr] navigation failed:', error);
      throw error;
    }
    if (isStaleRouteRequest(requestId)) {
      rollback();
      return;
    }

    // Publish every root. A commit undone by a failed DOM write aborts the
    // navigation: roots not yet published are rolled back and the location
    // stays. Failures after a commit applied (a throwing ref) are reported, and
    // the navigation completes because the page did change.
    const committedFailures: unknown[] = [];
    for (const root of roots) {
      const result = root.prepared.publish();
      if (result.aborted) {
        rollback();
        const failure = result.errors[0];
        logger.error('[Askr] navigation failed:', failure);
        throw failure;
      }
      committedFailures.push(...result.errors);
      syncAppRegistrationLocation(root.target.app, pathname, href);
    }
    for (const failure of committedFailures) reportUncaughtErrorLater(failure);
    const retired: unknown[] = [];
    for (const root of roots) retired.push(...root.prepared.retire());
    if (retired.length) {
      reportUncaughtErrorLater(
        retired.length === 1
          ? retired[0]
          : new AggregateError(retired, 'Route cleanup failed')
      );
    }

    flushSync();
    if (isStaleRouteRequest(requestId)) return;
    try {
      updateHistory();
      setCurrentRouteLocation(pathname, href);
      syncRegisteredRouteSnapshot();
      reconcileNavigationMetadata(targets);
      updateScroll();
    } catch (error) {
      logger.error('[Askr] navigation failed:', error);
      throw error;
    }
  } finally {
    for (const root of roots) root.prepared.complete();
  }
}
