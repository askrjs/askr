import type { RouteConfig } from './types';

export interface ResolvedRouteDescriptor {
  route: RouteConfig;
  path: string;
  filePath: string;
  routeId: string;
  invalidationKeys: string[];
}

function assertSafeRoutePath(pathStr: string): void {
  if (
    !pathStr.startsWith('/') ||
    pathStr.startsWith('//') ||
    pathStr.includes('\\') ||
    pathStr.includes('\0') ||
    pathStr.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(
      `SSG route path must be an absolute URL path without dot segments or backslashes: ${pathStr}`
    );
  }
}

export function getOutputFilePath(pathStr: string): string {
  assertSafeRoutePath(pathStr);
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
