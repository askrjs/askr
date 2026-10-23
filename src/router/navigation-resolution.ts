import { isPromiseLike } from '../common/promise';
import type { RouteRequestResult } from '../common/router';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import {
  getRegisteredAppsSnapshot,
  type AppRegistration,
} from './navigation-registry';
import { resolveOwnedRouteRequest, getRouteMetaContext } from './resolution';
import { resolveOwnedRouteMeta } from './metadata';
import { isRouteErrorResult } from './route-error';
import { isRenderResult, type AppNavigationTarget } from './navigation-types';

export function createNavigationTarget(
  app: AppRegistration,
  resolved: RouteRequestResult,
  runtime: AppRenderRuntime | undefined,
  skipMetadata = false
): AppNavigationTarget | Promise<AppNavigationTarget> {
  if (
    skipMetadata ||
    app.instance.appRuntime !== runtime ||
    !isRenderResult(resolved) ||
    !resolved.record ||
    isRouteErrorResult(resolved)
  )
    return { app, resolved, runtime };
  const hasMetadata = Boolean(
    resolved.record.options.title ||
    resolved.record.options.meta ||
    resolved.record.metaChain?.length
  );
  if (!hasMetadata) return { app, resolved, runtime };
  const context = getRouteMetaContext(resolved);
  if (!context) return { app, resolved, runtime };
  return resolveOwnedRouteMeta(resolved.record, context, () => {
    if (app.instance.appRuntime !== runtime) {
      throw new DOMException(
        'The app runtime no longer owns this metadata.',
        'AbortError'
      );
    }
  }).then((metadata) => ({ app, runtime, resolved, metadata }));
}

function resolveAppRouteRequest(
  app: AppRegistration,
  pathname: string,
  href: string,
  signal: AbortSignal,
  runtime: AppRenderRuntime | undefined,
  prefetch = false
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveOwnedRouteRequest(
    href,
    {
      registry: app.registry,
      auth: app.auth,
      signal,
      dataRuntime: runtime?.dataRuntime,
      routeErrors: !prefetch,
      ...(prefetch ? { prefetch: true } : {}),
    },
    () => {
      if (app.instance.appRuntime !== runtime) {
        throw new DOMException(
          'The app runtime no longer owns this navigation.',
          'AbortError'
        );
      }
    }
  );
}

export function resolveNavigationTargetsForApps(
  pathname: string,
  href: string,
  signal: AbortSignal,
  options: { prefetch?: boolean } = {}
): AppNavigationTarget[] | Promise<AppNavigationTarget[]> {
  const apps = getRegisteredAppsSnapshot();

  if (apps.length === 1) {
    const app = apps[0]!;
    const runtime = app.instance.appRuntime;
    const resolved = resolveAppRouteRequest(
      app,
      pathname,
      href,
      signal,
      runtime,
      options.prefetch
    );
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      return Promise.resolve(resolved).then((next) => {
        const target = createNavigationTarget(
          app,
          next,
          runtime,
          options.prefetch
        );
        return isPromiseLike(target)
          ? Promise.resolve(target).then((ready) => [ready])
          : [target];
      });
    }
    const target = createNavigationTarget(
      app,
      resolved,
      runtime,
      options.prefetch
    );
    return isPromiseLike(target)
      ? Promise.resolve(target).then((next) => [next])
      : [target];
  }

  const syncTargets: AppNavigationTarget[] = [];
  const pendingTargets: Array<Promise<AppNavigationTarget>> = [];

  for (const app of apps) {
    const runtime = app.instance.appRuntime;
    const resolved = resolveAppRouteRequest(
      app,
      pathname,
      href,
      signal,
      runtime,
      options.prefetch
    );
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      pendingTargets.push(
        Promise.resolve(resolved).then((next) =>
          createNavigationTarget(app, next, runtime, options.prefetch)
        )
      );
      continue;
    }
    const target = createNavigationTarget(
      app,
      resolved,
      runtime,
      options.prefetch
    );
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
