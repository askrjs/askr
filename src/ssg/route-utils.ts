import type { RouteConfig } from './types';
import { encodePathSegment } from '../router/match';
import { foldPortablePathCase } from './unicode-case-fold';

export interface ResolvedRouteDescriptor {
  route: RouteConfig;
  path: string;
  filePath: string;
  routeId: string;
  invalidationKeys: string[];
}

function getPortableOutputPathKey(filePath: string): string {
  return foldPortablePathCase(filePath.normalize('NFC').replaceAll('\\', '/'));
}

function describeRoute(descriptor: ResolvedRouteDescriptor): string {
  if (descriptor.route.path === descriptor.path) {
    return `"${descriptor.path}"`;
  }
  return `"${descriptor.route.path}" (resolved as "${descriptor.path}")`;
}

function outputPathsOverlap(left: string, right: string): boolean {
  const leftKey = getPortableOutputPathKey(left);
  const rightKey = getPortableOutputPathKey(right);
  return (
    leftKey === rightKey ||
    leftKey.startsWith(`${rightKey}/`) ||
    rightKey.startsWith(`${leftKey}/`)
  );
}

/** Reject routes that could overwrite one another on any supported filesystem. */
export function validateOutputPathCollisions(
  descriptors: readonly ResolvedRouteDescriptor[]
): void {
  const seen = new Map<string, ResolvedRouteDescriptor>();
  const reservedFiles = ['metadata.json', '.askr/ssg-manifest.json'];

  for (const descriptor of descriptors) {
    const key = getPortableOutputPathKey(descriptor.filePath);
    const existing = seen.get(key);
    if (existing) {
      throw new Error(
        `SSG output path collision: routes ${describeRoute(existing)} and ${describeRoute(descriptor)} map to overlapping paths after case-insensitive normalization`
      );
    }
    for (const reservedFile of reservedFiles) {
      if (outputPathsOverlap(descriptor.filePath, reservedFile)) {
        throw new Error(
          `SSG output path collision: route ${describeRoute(descriptor)} overlaps generated file "${reservedFile}"`
        );
      }
    }
    for (const prior of seen.values()) {
      if (outputPathsOverlap(prior.filePath, descriptor.filePath)) {
        throw new Error(
          `SSG output path collision: routes ${describeRoute(prior)} and ${describeRoute(descriptor)} map to overlapping paths after case-insensitive normalization`
        );
      }
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

/** Where hosts look for the not-found page. */
export const NOT_FOUND_FILE = '404.html';

export function getOutputFilePath(pathStr: string): string {
  assertSafeRoutePath(pathStr);
  if (pathStr === '/') {
    return 'index.html';
  }
  const normalized = pathStr.replace(/^\/|\/$/g, '');
  return `${normalized}/index.html`;
}

/** Prefer normalized names while accepting legacy raw template keys. */
export function readRouteParameter(
  params: Record<string, string>,
  key: string
): { name: string; splat: boolean; value: string | undefined } {
  const normalized = key.trim();
  const splat = normalized.startsWith('*');
  const name = splat ? normalized.slice(1).trim() : normalized;
  const canonical = params[name];
  const value =
    key === name ||
    typeof canonical === 'string' ||
    Object.prototype.hasOwnProperty.call(params, name)
      ? canonical
      : params[key];
  return { name, splat, value };
}

export function interpolateRoutePath(
  routePath: string,
  params?: Record<string, string>
): string {
  if (!params) return routePath;
  return routePath.replace(/\{([^}]+)\}/g, (_, key: string) => {
    return readRouteParameter(params, key).value ?? '';
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
    const { splat, value: parameterValue } = readRouteParameter(params, key);
    const value = parameterValue ?? '';
    return splat
      ? value.split('/').map(encodePathSegment).join('/')
      : encodePathSegment(value);
  });
}

export function resolveRouteDescriptor(
  route: RouteConfig
): ResolvedRouteDescriptor {
  const path = interpolateRoutePath(route.path, route.params);
  const filePath = route.notFound ? NOT_FOUND_FILE : getOutputFilePath(path);
  return {
    route,
    path,
    filePath,
    routeId: `${path}::${filePath}`,
    invalidationKeys: route.invalidationKeys?.slice() ?? [],
  };
}
