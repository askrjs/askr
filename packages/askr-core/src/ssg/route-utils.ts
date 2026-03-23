import type { RouteConfig } from './types';

export interface ResolvedRouteDescriptor {
  route: RouteConfig;
  path: string;
  filePath: string;
  routeId: string;
  invalidationKeys: string[];
}

export function getOutputFilePath(pathStr: string): string {
  if (pathStr === '/') {
    return 'index.html';
  }
  const normalized = pathStr.replace(/^\/|\/$/g, '');
  return `${normalized}/index.html`;
}

export function interpolateRoutePath(
  routePath: string,
  params?: Record<string, string>
): string {
  if (!params) return routePath;
  return routePath.replace(
    /\{([^}]+)\}/g,
    (_, key: string) => params[key] ?? ''
  );
}

export function resolveRouteDescriptor(
  route: RouteConfig
): ResolvedRouteDescriptor {
  const path = interpolateRoutePath(route.path, route.params);
  const filePath = getOutputFilePath(path);
  return {
    route,
    path,
    filePath,
    routeId: `${path}::${filePath}`,
    invalidationKeys: route.invalidationKeys?.slice() ?? [],
  };
}
