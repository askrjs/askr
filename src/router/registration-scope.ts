import type {
  GroupHelperOptions,
  PageHelperOptions,
  RouteComponent,
  RouteDefinition,
} from '../common/router';
import { compileNodePolicies } from './access';
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
    },
    fn
  );
}
