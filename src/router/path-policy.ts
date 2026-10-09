import { normalizeRouteSegmentName } from './match';

export function validateRoutePath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error(`Route path must begin with "/". Got: "${path}"`);
  }
  if (/\/{2,}/.test(path)) {
    throw new Error('Route path cannot contain consecutive slashes.');
  }
  if (/:([^/{}]+)/.test(path)) {
    const suggested = path.replace(/:([^/{}]+)/g, '{$1}');
    throw new Error(
      `Route parameter syntax uses {name} interpolation, not :name. ` +
        `Use "${suggested}" instead of "${path}".`
    );
  }

  const segments = path.split('/').filter(Boolean);
  const seenParamNames = new Set<string>();

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment === '*') {
      continue;
    }

    const hasOpenBrace = segment.includes('{');
    const hasCloseBrace = segment.includes('}');

    if (!hasOpenBrace && !hasCloseBrace) {
      continue;
    }

    if (!(segment.startsWith('{') && segment.endsWith('}'))) {
      throw new Error(
        'Route parameter segments must use complete {name} interpolation.'
      );
    }

    const rawParamName = normalizeRouteSegmentName(segment.slice(1, -1));
    const isSplat = rawParamName.startsWith('*');
    const paramName = isSplat
      ? normalizeRouteSegmentName(rawParamName.slice(1))
      : rawParamName;

    if (!paramName) {
      throw new Error(
        isSplat
          ? 'Route splat parameter name cannot be empty.'
          : 'Route parameter name cannot be empty.'
      );
    }

    if (isSplat && paramName === '*') {
      throw new Error('Route named splat parameter name cannot be "*".');
    }

    if (isSplat && index !== segments.length - 1) {
      throw new Error(
        'Route named splat parameters must be the final segment.'
      );
    }

    if (seenParamNames.has(paramName)) {
      throw new Error(
        `Route path cannot reuse duplicate parameter name "${paramName}".`
      );
    }

    seenParamNames.add(paramName);
  }
}

export function normalizeAbsoluteRoutePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized || '/';
}

export function joinRoutePaths(prefix: string, path: string): string {
  const normalizedPrefix = normalizeAbsoluteRoutePath(prefix || '/');
  let start = 0;
  let end = path.length;
  while (start < end && path[start] === '/') start++;
  while (end > start && path[end - 1] === '/') end--;
  const normalizedPath = path.slice(start, end);

  if (!normalizedPath) {
    return normalizedPrefix;
  }

  return normalizedPrefix === '/'
    ? `/${normalizedPath}`
    : `${normalizedPrefix}/${normalizedPath}`;
}
