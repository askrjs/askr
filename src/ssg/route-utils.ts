import type { RouteConfig } from './types';
import { encodePathSegment } from '../router/match';

export interface ResolvedRouteDescriptor {
  route: RouteConfig;
  path: string;
  filePath: string;
  routeId: string;
  invalidationKeys: string[];
}

function getPortableOutputPathKey(filePath: string): string {
  return filePath.normalize('NFC').replaceAll('\\', '/').toLowerCase();
}

function describeRoute(descriptor: ResolvedRouteDescriptor): string {
  if (descriptor.route.path === descriptor.path) {
    return `"${descriptor.path}"`;
  }
  return `"${descriptor.route.path}" (resolved as "${descriptor.path}")`;
}

/** Reject routes that could overwrite one another on any supported filesystem. */
export function validateOutputPathCollisions(
  descriptors: readonly ResolvedRouteDescriptor[]
): void {
  const seen = new Map<string, ResolvedRouteDescriptor>();

  for (const descriptor of descriptors) {
    const key = getPortableOutputPathKey(descriptor.filePath);
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `SSG output path collision: routes ${describeRoute(existing)} and ${describeRoute(descriptor)} both map to "${descriptor.filePath}" after case-insensitive normalization`
      );
    }
    seen.set(key, descriptor);
  }
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
  return routePath.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const normalized = key.trim();
    const name = normalized.startsWith('*')
      ? normalized.slice(1).trim()
      : normalized;
    return params[name] ?? '';
  });
}

/** Encode the render URL while retaining the existing concrete output path. */
export function interpolateRouteUrl(
  routePath: string,
  params?: Record<string, string>
): string {
  const rawPath = interpolateRoutePath(routePath, params);
  // Keep the output-path traversal rejection before encoding parameters.
  // Otherwise encoding could disguise a formerly rejected dot segment.
  assertSafeRoutePath(rawPath);
  if (!params) return routePath;
  return routePath.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const normalized = key.trim();
    const splat = normalized.startsWith('*');
    const name = splat ? normalized.slice(1).trim() : normalized;
    const value = params[name] ?? '';
    return splat
      ? value.split('/').map(encodePathSegment).join('/')
      : encodePathSegment(value);
  });
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
