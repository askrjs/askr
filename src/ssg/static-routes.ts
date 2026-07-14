/**
 * SSG route source normalization and runtime-only filtering.
 */

import type { RouteConfig, RouteRenderResult } from './types';
import type { RouteRegistry } from '../common/router';
import { expandRoutes } from './resolve-ssg-data';
import {
  getOutputFilePath,
  interpolateRoutePath,
  resolveRouteDescriptor,
} from './route-utils';

type StaticRouteSource = {
  registry?: RouteRegistry;
  routes?: readonly RouteConfig[];
};

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

  return null;
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
  if (options.registry) {
    return routeRegistryToRouteConfigs(options.registry);
  }

  return [...(options.routes ?? [])];
}

function routeRegistryToRouteConfigs(registry: RouteRegistry): RouteConfig[] {
  const routeConfigs: RouteConfig[] = [];

  for (const record of registry.manifest.records) {
    if (record.isFallback) {
      continue;
    }

    routeConfigs.push({
      path: record.path,
      handler: record.handler,
      namespace: record.options.namespace,
      auth: record.options.auth,
      policies: record.options.policies,
      entries: record.options.entries,
    });
  }

  return routeConfigs;
}
