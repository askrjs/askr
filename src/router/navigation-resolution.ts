import { isPromiseLike } from '../common/promise';
import type { RouteRequestResult } from '../common/router';
import {
  getRegisteredAppsSnapshot,
  type AppRegistration,
} from './navigation-registry';
import { resolveRouteRequest, getRouteRenderContext } from './resolution';
import { resolveRouteMeta } from './metadata';
import { isRenderResult, type AppNavigationTarget } from './navigation-types';

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
    dataRuntime: app.instance.appRuntime?.dataRuntime,
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
