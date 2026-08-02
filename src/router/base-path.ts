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

/** Add a registry mount point to one logical root-relative route target. */
export function addRouteBasePath(target: string, basePath: string): string {
  if (!basePath || !target.startsWith('/') || target.startsWith('//')) {
    return target;
  }
  const parsed = parsedTarget(target);
  if (
    parsed.origin !== 'http://askr.invalid' ||
    parsed.pathname === basePath ||
    parsed.pathname.startsWith(`${basePath}/`)
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
  if (parsed.pathname === basePath || parsed.pathname === `${basePath}/`) {
    return `/${parsed.search}${parsed.hash}`;
  }
  if (!parsed.pathname.startsWith(`${basePath}/`)) return undefined;
  return `${parsed.pathname.slice(basePath.length)}${parsed.search}${parsed.hash}`;
}
