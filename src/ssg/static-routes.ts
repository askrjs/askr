/**
 * SSG route source normalization and runtime-only filtering.
 */

import type { RouteConfig, RouteRenderResult } from './types';
import type { RoutePolicy, RouteRegistry } from '../common/router';
import { _getBuiltInRoutePolicy } from '../router/route';
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

  if (route.auth === true) {
    return `Skipped prerender for "${path}": authenticated routes are runtime-only by default.`;
  }

  if (route.role) {
    return `Skipped prerender for "${path}": role-gated routes are runtime-only by default.`;
  }

  if (route.permission) {
    return `Skipped prerender for "${path}": permission-gated routes are runtime-only by default.`;
  }

  if (policies.length > 0) {
    let hasAuthPolicy = false;
    let hasRolePolicy = false;
    let hasPermissionPolicy = false;

    for (const policy of policies) {
      const metadata = _getBuiltInRoutePolicy(policy);
      if (!metadata) {
        return `Skipped prerender for "${path}": routes with custom policies are runtime-only by default.`;
      }

      if (metadata.kind === 'auth') {
        hasAuthPolicy = true;
      } else if (metadata.kind === 'role') {
        hasRolePolicy = true;
      } else if (metadata.kind === 'permission') {
        hasPermissionPolicy = true;
      }
    }

    if (hasAuthPolicy) {
      return `Skipped prerender for "${path}": authenticated routes are runtime-only by default.`;
    }

    if (hasRolePolicy) {
      return `Skipped prerender for "${path}": role-gated routes are runtime-only by default.`;
    }

    if (hasPermissionPolicy) {
      return `Skipped prerender for "${path}": permission-gated routes are runtime-only by default.`;
    }

    return null;
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
      role: record.options.role,
      permission: record.options.permission,
      policies: stripRegistryGuestPolicies(record.options.policies),
      entries: record.options.entries,
    });
  }

  return routeConfigs;
}

function stripRegistryGuestPolicies(
  policies: readonly RoutePolicy[] | undefined
): readonly RoutePolicy[] | undefined {
  if (!policies || policies.length === 0) {
    return undefined;
  }

  const filtered = policies.filter(
    (policy) => _getBuiltInRoutePolicy(policy)?.kind !== 'guest'
  );

  return filtered.length > 0 ? filtered : undefined;
}
