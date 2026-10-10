import { isPromiseLike } from '../common/promise';
import type { RouteRequestResult } from '../common/router';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import {
  getRegisteredAppsSnapshot,
  type AppRegistration,
} from './navigation-registry';
import { resolveOwnedRouteRequest, getRouteRenderContext } from './resolution';
import { resolveRouteMeta } from './metadata';
import { isRenderResult, type AppNavigationTarget } from './navigation-types';

function createNavigationTarget(
  app: AppRegistration,
  resolved: RouteRequestResult,
  runtime: AppRenderRuntime | undefined
): AppNavigationTarget | Promise<AppNavigationTarget> {
  if (
    app.instance.appRuntime !== runtime ||
    !isRenderResult(resolved) ||
    !resolved.record
  )
    return { app, resolved, runtime };
  const hasMetadata = Boolean(
    resolved.record.options.title ||
    resolved.record.options.meta ||
    resolved.record.metaChain?.length
  );
  if (!hasMetadata) return { app, resolved, runtime };
  const context = getRouteRenderContext(resolved);
  if (!context) return { app, resolved, runtime };
  return resolveRouteMeta(resolved.record, context).then((metadata) => ({
    app,
    runtime,
    resolved,
    metadata,
  }));
}

function resolveAppRouteRequest(
  app: AppRegistration,
  pathname: string,
  href: string,
  signal: AbortSignal,
  runtime: AppRenderRuntime | undefined
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveOwnedRouteRequest(
    href,
    {
      registry: app.registry,
      auth: app.auth,
      signal,
      dataRuntime: runtime?.dataRuntime,
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
  signal: AbortSignal
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
      runtime
    );
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      return Promise.resolve(resolved).then((next) => {
        const target = createNavigationTarget(app, next, runtime);
        return isPromiseLike(target)
          ? Promise.resolve(target).then((ready) => [ready])
          : [target];
      });
    }
    const target = createNavigationTarget(app, resolved, runtime);
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
      runtime
    );
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      pendingTargets.push(
        Promise.resolve(resolved).then((next) =>
          createNavigationTarget(app, next, runtime)
        )
      );
      continue;
    }
    const target = createNavigationTarget(app, resolved, runtime);
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
