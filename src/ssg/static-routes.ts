/**
 * SSG route source normalization and runtime-only filtering.
 */

import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteRecord, RouteRegistry } from '../common/router';
import { getRenderHandler } from '../router/rendering';
import { expandRoutes } from './resolve-ssg-data';
import {
  getOutputFilePath,
  interpolateRoutePath,
  resolveRouteDescriptor,
} from './route-utils';

type StaticRouteSource = { registry: RouteRegistry };

export type RuntimeOnlyRoute = {
  routeId: string;
  result: RouteRenderResult;
};

export interface SplitStaticRoutesResult {
  routes: RouteConfig[];
  runtimeOnly: RuntimeOnlyRoute[];
  outputRouteIds: string[];
}

function getRuntimeOnlyDiagnostic(
  route: RouteConfig,
  path: string
): string | null {
  const policies = route.policies ?? [];

  if (route.auth) {
    return `Skipped prerender for "${path}": routes with auth requirements are runtime-only by default.`;
  }

  if (policies.length > 0) {
    return `Skipped prerender for "${path}": routes with policies are runtime-only by default.`;
  }

  if (route.path.includes('{') && !route.entries && !route.params) {
    return `Skipped prerender for "${path}": a parameterized route without entries() is runtime-only.`;
  }

  return null;
}

/** The render path of the not-found page; it is written as `404.html`. */
export const NOT_FOUND_PATH = '/404';

function isRootFallback(record: RouteRecord): boolean {
  const prefix = (record as { fallbackPrefix?: string }).fallbackPrefix;
  return prefix === undefined || prefix === '' || prefix === '/';
}

function getRouteResultPath(route: RouteConfig): string {
  return route.params
    ? interpolateRoutePath(route.path, route.params)
    : route.path;
}

function createRuntimeOnlyRoute(
  route: RouteConfig,
  diagnostic: string
): RuntimeOnlyRoute {
  const path = getRouteResultPath(route);
  const filePath = getOutputFilePath(path);

  return {
    routeId: `${path}::${filePath}`,
    result: {
      path,
      filePath,
      html: '',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'skipped',
      reason: 'runtime-only',
      written: false,
      error: diagnostic,
    },
  };
}

export async function splitStaticRoutes(
  routes: readonly RouteConfig[]
): Promise<SplitStaticRoutesResult> {
  const prerenderableRoutes: RouteConfig[] = [];
  const runtimeOnly: RuntimeOnlyRoute[] = [];
  const outputRouteIds: string[] = [];

  for (const route of routes) {
    const routePath = getRouteResultPath(route);
    const diagnostic = getRuntimeOnlyDiagnostic(route, routePath);
    if (diagnostic) {
      const runtimeRoute = createRuntimeOnlyRoute(route, diagnostic);
      runtimeOnly.push(runtimeRoute);
      outputRouteIds.push(runtimeRoute.routeId);
      continue;
    }

    const expanded = await expandRoutes([route]);
    prerenderableRoutes.push(...expanded);
    for (const expandedRoute of expanded) {
      outputRouteIds.push(resolveRouteDescriptor(expandedRoute).routeId);
    }
  }

  return {
    routes: prerenderableRoutes,
    runtimeOnly,
    outputRouteIds,
  };
}

export function normalizeStaticRoutes(
  options: StaticRouteSource
): RouteConfig[] {
  return routeRegistryToRouteConfigs(options.registry);
}

function routeRegistryToRouteConfigs(registry: RouteRegistry): RouteConfig[] {
  const routeConfigs: RouteConfig[] = [];

  for (const record of registry.manifest.records) {
    if (record.isFallback) {
      // The root fallback is the site's not-found page; hosts serve
      // `404.html` for every miss. Scoped fallbacks stay runtime-only.
      if (isRootFallback(record)) {
        routeConfigs.push({
          path: NOT_FOUND_PATH,
          handler: getRenderHandler(record),
          namespace: record.options.namespace,
          basePath: registry.manifest.basePath,
          record,
          notFound: true,
        });
      }
      continue;
    }

    // One record per route template: concrete pages come from entries(), and
    // they share the template's invalidation keys.
    const options = record.options;
    routeConfigs.push({
      path: record.path,
      handler: getRenderHandler(record),
      invalidationKeys: options.invalidationKeys
        ? [...options.invalidationKeys]
        : undefined,
      namespace: options.namespace,
      auth: options.auth,
      policies: options.policies,
      entries: options.entries,
      loader: options.loader,
      search: options.search,
      dehydrate: options.dehydrate,
      preload: options.preload,
      basePath: registry.manifest.basePath,
      record,
    });
  }

  return routeConfigs;
}
