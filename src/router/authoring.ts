import type {
  GroupHelperOptions,
  PageHelperOptions,
  RouteComponent,
  RouteDefinition,
  RouteOptions,
  RouteParams,
  RoutePathParams,
  RouteRef,
  RouteRefSearch,
} from '../common/router';
import { allOf } from '@askrjs/auth';
import type { AuthRequirement } from '@askrjs/auth';
import type { ObjectSchema } from '@askrjs/schema';
import { getCurrentComponentInstance } from '../runtime';
import { getExecutionModel } from '../runtime';
import { computeRank, normalizeRouteSegmentName, parseSegments } from './match';
import { compileNodePolicies } from './access';
import type { AnyRouteComponent, InternalRouteRecord } from './internal-types';
import { createRouteHandler } from './rendering';
import {
  addRouteToStores,
  assertRouteRegistrationUnlocked,
  getCurrentInheritedAuthRequirements,
  getCurrentInheritedMeta,
  getCurrentInheritedPolicies,
  getCurrentLayoutChain,
  getCurrentPageChain,
  getCurrentPageScope,
  getCurrentPathPrefix,
  getCurrentScopeKind,
  getDefaultRouteBasePath,
  hasActivePageScope,
  insertRecordSorted,
  pushRegistrationScope,
} from './store';

type RouteComponentParam<TComponent extends AnyRouteComponent> =
  Parameters<TComponent> extends [] ? unknown : Parameters<TComponent>[0];

type CompatibleAbsoluteRouteComponent<
  Path extends string,
  TComponent extends AnyRouteComponent,
> =
  Parameters<TComponent> extends []
    ? TComponent
    : RoutePathParams<Path> extends RouteComponentParam<TComponent>
      ? TComponent
      : never;

type CompatibleRelativeRouteComponent<
  Path extends string,
  TComponent extends AnyRouteComponent,
> =
  Parameters<TComponent> extends []
    ? TComponent
    : RouteComponentParam<TComponent> extends Record<
          keyof RoutePathParams<Path>,
          string
        >
      ? TComponent
      : never;

type CompatibleRouteComponent<
  Path extends string,
  TComponent extends AnyRouteComponent,
> = Path extends `/${string}`
  ? CompatibleAbsoluteRouteComponent<Path, TComponent>
  : CompatibleRelativeRouteComponent<Path, TComponent>;

type RouteOptionsForComponent<
  Path extends string,
  TComponent extends AnyRouteComponent,
  TSearchSchema extends
    | ObjectSchema<import('../common/router').RouteSearch>
    | undefined =
    | ObjectSchema<import('../common/router').RouteSearch>
    | undefined,
  TLoaderData = unknown,
  TDehydratedData = TLoaderData,
> =
  Parameters<TComponent> extends []
    ? RouteOptions<
        RoutePathParams<Path>,
        TSearchSchema,
        TLoaderData,
        TDehydratedData
      >
    : RouteComponentParam<TComponent> extends RouteParams
      ? RouteOptions<
          RouteComponentParam<TComponent>,
          TSearchSchema,
          TLoaderData,
          TDehydratedData
        >
      : RouteOptions<
          RoutePathParams<Path>,
          TSearchSchema,
          TLoaderData,
          TDehydratedData
        >;

function validateRoutePath(path: string): void {
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

function normalizeAbsoluteRoutePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalized || '/';
}

function joinRoutePaths(prefix: string, path: string): string {
  const normalizedPrefix = normalizeAbsoluteRoutePath(prefix || '/');
  const normalizedPath = path.replace(/^\/+|\/+$/g, '');

  if (!normalizedPath) {
    return normalizedPrefix;
  }

  return normalizedPrefix === '/'
    ? `/${normalizedPath}`
    : `${normalizedPrefix}/${normalizedPath}`;
}

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

function resolveIndexPath(): string {
  return normalizeAbsoluteRoutePath(getCurrentPathPrefix() || '/');
}

function resolveRouteRegistrationPath(path: string): string {
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

function pushGroupScope(
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

function pushPageScope(
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

function normalizeRouteOptions(
  options: RouteOptions | undefined
): RouteOptions | undefined {
  if (!options) {
    return undefined;
  }

  const loader = options.loader;
  const dehydrate = options.dehydrate;
  const preload = options.preload;
  const policies = compileNodePolicies(options);

  if (
    !loader &&
    !dehydrate &&
    !preload &&
    !options.entries &&
    policies.length === 0 &&
    !options.title &&
    !options.namespace &&
    !options.search &&
    !options.meta &&
    !options.actions &&
    options.auth === undefined
  ) {
    return undefined;
  }

  return {
    ...(loader ? { loader } : {}),
    ...(dehydrate ? { dehydrate } : {}),
    ...(preload ? { preload } : {}),
    ...(options.entries ? { entries: options.entries } : {}),
    ...(options.auth !== undefined ? { auth: options.auth } : {}),
    ...(policies.length > 0 ? { policies } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.namespace ? { namespace: options.namespace } : {}),
    ...(options.search ? { search: options.search } : {}),
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.actions ? { actions: options.actions } : {}),
  };
}

function registerRouteAtResolvedPath(
  path: string,
  Component: RouteComponent,
  options?: RouteOptions,
  metadata?: {
    isFallback?: boolean;
    fallbackPrefix?: string;
  }
): void {
  validateRoutePath(path);

  const chain = getCurrentLayoutChain();
  const pageChain = getCurrentPageChain();
  const segments = parseSegments(path);
  const rank = computeRank(segments);
  const isFallback = metadata?.isFallback ?? path === '/*';
  const comp = Component;
  const normalizedOptions = normalizeRouteOptions(options);
  const policies = [
    ...getCurrentInheritedPolicies(),
    ...(normalizedOptions?.policies ?? []),
  ];
  const authRequirements = [
    ...getCurrentInheritedAuthRequirements(),
    ...(normalizedOptions?.auth ? [normalizedOptions.auth] : []),
  ];
  const auth: AuthRequirement | undefined =
    authRequirements.length === 0
      ? undefined
      : authRequirements.length === 1
        ? authRequirements[0]
        : allOf(...authRequirements);
  const metaChain = [
    ...getCurrentInheritedMeta(),
    ...(normalizedOptions?.meta ? [normalizedOptions.meta] : []),
  ];

  const handler = createRouteHandler(comp, pageChain, chain);
  const renderHandler = createRouteHandler(comp, pageChain, chain, true);

  const record: InternalRouteRecord = {
    path,
    component: comp,
    segments,
    rank,
    layoutChain: chain,
    pageChain,
    options: normalizedOptions
      ? {
          ...normalizedOptions,
          ...(auth ? { auth } : {}),
          ...(policies.length > 0 ? { policies } : {}),
        }
      : policies.length > 0
        ? { policies, ...(auth ? { auth } : {}) }
        : auth
          ? { auth }
          : {},
    ...(metaChain.length > 0 ? { metaChain } : {}),
    isFallback,
    handler,
    renderHandler,
    ...(metadata?.fallbackPrefix
      ? { fallbackPrefix: metadata.fallbackPrefix }
      : {}),
  };

  insertRecordSorted(record);
  addRouteToStores({
    path,
    handler,
    namespace: normalizedOptions?.namespace ?? options?.namespace,
    ...(metadata?.fallbackPrefix
      ? { fallbackPrefix: metadata.fallbackPrefix }
      : {}),
  });
}

export function group(options: GroupHelperOptions, fn: RouteDefinition): void;
export function group(options: GroupHelperOptions, fn: RouteDefinition): void {
  pushGroupScope(options, fn);
}

export function page<const TPath extends string>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  fn: RouteDefinition
): void;
export function page<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  fn: RouteDefinition
): void;
export function page<const TPath extends string>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  options: PageHelperOptions,
  fn: RouteDefinition
): void;
export function page<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  options: PageHelperOptions,
  fn: RouteDefinition
): void;
export function page(
  path: string,
  Component: RouteComponent,
  optionsOrFn: PageHelperOptions | RouteDefinition,
  maybeFn?: RouteDefinition
): void {
  const options =
    typeof optionsOrFn === 'function' ? ({} as PageHelperOptions) : optionsOrFn;
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;

  if (typeof Component !== 'function') {
    throw new Error(
      'page(path, Component, fn) requires a component function as the second argument.'
    );
  }

  if (typeof fn !== 'function') {
    throw new Error(
      'page(path, Component, fn) requires a route definition callback as the final argument.'
    );
  }

  pushPageScope(path, Component, options, fn);
}

export function index(Component: RouteComponent, options?: RouteOptions): void {
  const pageScope = getCurrentPageScope();
  if (pageScope?.hasIndex) {
    throw new Error('page() cannot declare multiple index routes.');
  }

  if (pageScope) {
    pageScope.hasIndex = true;
  }

  registerRouteAtResolvedPath(resolveIndexPath(), Component, options);
}

export function fallback(Component: RouteComponent): void {
  if (hasActivePageScope()) {
    if (getCurrentScopeKind() !== 'page') {
      throw new Error(
        'fallback() inside page() must be declared directly in the page scope, not inside nested group().'
      );
    }

    registerRouteAtResolvedPath(
      `${getCurrentPathPrefix()}/*`,
      Component,
      undefined,
      { isFallback: true, fallbackPrefix: getCurrentPathPrefix() }
    );
    return;
  }

  const allowsRootFallback =
    getCurrentInheritedPolicies().length === 0 &&
    getCurrentInheritedAuthRequirements().length === 0;

  if (!allowsRootFallback) {
    throw new Error(
      'fallback() can only be registered at the root scope. ' +
        'Use route("/*", Component) if you need compatibility behavior.'
    );
  }

  registerRouteAtResolvedPath('/*', Component, undefined, {
    isFallback: true,
    fallbackPrefix: '/',
  });
}

export function route<
  const TPath extends string,
  const TSearchSchema extends
    | ObjectSchema<import('../common/router').RouteSearch>
    | undefined = undefined,
  TLoaderData = unknown,
  TDehydratedData = TLoaderData,
>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  options?: RouteOptions<
    RoutePathParams<TPath>,
    TSearchSchema,
    TLoaderData,
    TDehydratedData
  >
): RouteRef<RoutePathParams<TPath>, RouteRefSearch<TSearchSchema>>;
export function route<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
  const TSearchSchema extends
    | ObjectSchema<import('../common/router').RouteSearch>
    | undefined = undefined,
  TLoaderData = unknown,
  TDehydratedData = TLoaderData,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  options?: RouteOptionsForComponent<
    TPath,
    TComponent,
    TSearchSchema,
    TLoaderData,
    TDehydratedData
  >
): RouteRef<RoutePathParams<TPath>, RouteRefSearch<TSearchSchema>>;
export function route(
  path: string,
  Component: RouteComponent,
  options?: RouteOptions
): RouteRef<RouteParams, unknown> {
  if (typeof path === 'undefined') {
    throw new Error(
      'route() is only for route registration. Use currentRoute() inside components.'
    );
  }

  if (getExecutionModel() === 'islands') {
    throw new Error(
      'Routes are not supported with islands. Use createSPA (client) or createSSR (server) instead.'
    );
  }

  const currentInst = getCurrentComponentInstance();
  if (currentInst && currentInst.ssr) {
    throw new Error(
      'route() cannot be called during SSR rendering. Register routes at module load time instead.'
    );
  }

  assertRouteRegistrationUnlocked();

  if (typeof Component !== 'function') {
    throw new Error(
      'route(path, Component) requires a component function as the second argument. ' +
        'Passing JSX elements or VNodes directly is not supported.'
    );
  }

  if (options?.search && options.search.kind !== 'object') {
    throw new Error('route search must be an object schema.');
  }

  registerRouteAtResolvedPath(
    resolveRouteRegistrationPath(path),
    Component,
    options
  );
  return Object.freeze({
    path: resolveRouteRegistrationPath(path),
    ...(getDefaultRouteBasePath()
      ? { basePath: getDefaultRouteBasePath() }
      : {}),
    ...(options?.search ? { searchSchema: options.search } : {}),
  });
}
