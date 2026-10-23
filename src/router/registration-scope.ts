import type {
  GroupHelperOptions,
  PageHelperOptions,
  RouteComponent,
  RouteDefinition,
} from '../common/router';
import type { RegistrationScope } from './internal-types';
import { compileNodePolicies } from './access';
import { snapshotAppMeta } from './app-meta';
import {
  hasActivePageScope,
  getCurrentPathPrefix,
  pushRegistrationScope,
} from './store';
import {
  validateRoutePath,
  normalizeAbsoluteRoutePath,
  joinRoutePaths,
} from './path-policy';

function resolvePageScopePath(path: string): string {
  if (!path) {
    throw new Error('page(path, Component, fn) requires a non-empty path.');
  }

  if (path.startsWith('/')) {
    validateRoutePath(path);
    return normalizeAbsoluteRoutePath(path);
  }

  return joinRoutePaths(getCurrentPathPrefix(), path);
}

export function resolveIndexPath(): string {
  return normalizeAbsoluteRoutePath(getCurrentPathPrefix() || '/');
}

export function resolveRouteRegistrationPath(path: string): string {
  if (path.startsWith('/')) {
    if (hasActivePageScope()) {
      throw new Error(
        'Child route paths inside page() must be relative. ' +
          `Use "${path.slice(1)}" instead of "${path}".`
      );
    }

    validateRoutePath(path);
    return normalizeAbsoluteRoutePath(path);
  }

  const prefix = getCurrentPathPrefix();

  if (!prefix) {
    throw new Error(`Route path must begin with "/". Got: "${path}"`);
  }

  return joinRoutePaths(prefix, path);
}

function scopeLoader(
  options: GroupHelperOptions | PageHelperOptions
): Pick<RegistrationScope, 'loader' | 'staleTimeMs'> {
  if (options.loader !== undefined && typeof options.loader !== 'function') {
    throw new TypeError('group()/page() loader must be a function.');
  }
  assertStaleTime(options.staleTimeMs);
  return {
    ...(options.loader ? { loader: options.loader } : {}),
    ...(options.staleTimeMs !== undefined
      ? { staleTimeMs: options.staleTimeMs }
      : {}),
  };
}

export function assertStaleTime(value: unknown): void {
  if (
    value !== undefined &&
    value !== 'always' &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
  ) {
    throw new RangeError(
      'staleTimeMs must be a finite non-negative number or "always".'
    );
  }
}

export function pushGroupScope(
  options: GroupHelperOptions,
  fn: RouteDefinition
): void {
  const policies = compileNodePolicies(options);

  pushRegistrationScope(
    {
      kind: 'group',
      pathPrefix: getCurrentPathPrefix(),
      layout: options.layout,
      auth: options.auth,
      policies,
      meta: options.meta,
      appMeta: snapshotAppMeta(options.appMeta),
      error: options.error,
      forbidden: options.forbidden,
      ...scopeLoader(options),
    },
    fn
  );
}

export function pushPageScope(
  path: string,
  Component: RouteComponent,
  options: PageHelperOptions,
  fn: RouteDefinition
): void {
  if (hasActivePageScope()) {
    throw new Error(
      'page() cannot be nested inside another page(). ' +
        'Use route() for child leaves or group() for inherited behavior inside the existing page scope.'
    );
  }

  const policies = compileNodePolicies(options);

  pushRegistrationScope(
    {
      kind: 'page',
      pathPrefix: resolvePageScopePath(path),
      page: Component,
      hasIndex: false,
      auth: options.auth,
      policies,
      meta: options.meta,
      appMeta: snapshotAppMeta(options.appMeta),
      error: options.error,
      forbidden: options.forbidden,
      ...scopeLoader(options),
    },
    fn
  );
}
