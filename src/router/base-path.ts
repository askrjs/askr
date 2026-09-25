import { staticSegmentMatches } from './match';

/** Normalize the public mount point used by one route registry. */
export function normalizeRouteBasePath(value: string | undefined): string {
  if (value === undefined || value === '' || value === '/') return '';
  if (
    !value.startsWith('/') ||
    /\/{2,}/.test(value) ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\')
  ) {
    throw new TypeError(
      `Route basePath must be an absolute pathname without a query or hash. Received: ${JSON.stringify(value)}`
    );
  }
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  if (
    normalized.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new TypeError('Route basePath must not contain dot segments.');
  }
  return normalized;
}

function parsedTarget(target: string): URL {
  return new URL(target, 'http://askr.invalid');
}

/**
 * Strip `basePath` from a pathname, comparing segments in decoded form so an
 * encoded pathname (`/caf%C3%A9/menu`) matches its base (`/café`). Returns the
 * remaining pathname (at least `/`), or `undefined` outside the base.
 */
function stripRouteBasePath(
  pathname: string,
  basePath: string
): string | undefined {
  const pathParts = pathname.split('/');
  const baseParts = basePath.split('/');
  if (pathParts.length < baseParts.length) return undefined;
  for (let i = 1; i < baseParts.length; i++) {
    if (!staticSegmentMatches(baseParts[i], pathParts[i])) return undefined;
  }
  return `/${pathParts.slice(baseParts.length).join('/')}`;
}

/** Add a registry mount point to one logical root-relative route target. */
export function addRouteBasePath(target: string, basePath: string): string {
  if (!basePath || !target.startsWith('/') || target.startsWith('//')) {
    return target;
  }
  const parsed = parsedTarget(target);
  if (
    parsed.origin !== 'http://askr.invalid' ||
    stripRouteBasePath(parsed.pathname, basePath) !== undefined
  ) {
    return target;
  }
  return `${basePath}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Remove a registry mount point and retain query/hash for logical matching. */
export function removeRouteBasePath(
  target: string,
  basePath: string
): string | undefined {
  const parsed = parsedTarget(target);
  if (!basePath) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  const logicalPath = stripRouteBasePath(parsed.pathname, basePath);
  if (logicalPath === undefined) return undefined;
  return `${logicalPath}${parsed.search}${parsed.hash}`;
}
