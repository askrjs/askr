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
import type { ObjectSchema } from '@askrjs/schema';
import { currentComponent as getCurrentComponentInstance } from '../core/api/hooks';
import { getExecutionModel } from '../common/execution-model';
import type { AnyRouteComponent } from './internal-types';
import {
  assertRouteRegistrationUnlocked,
  getDefaultRouteBasePath,
} from './store';
import {
  pushGroupScope,
  pushPageScope,
  resolveRouteRegistrationPath,
} from './registration-scope';
import {
  registerRouteAtResolvedPath,
  registerIndexRoute,
  registerFallbackRoute,
} from './route-registration';

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

/** Declare a group of routes sharing `options` (auth, policies, layout, meta). */
export function group(options: GroupHelperOptions, fn: RouteDefinition): void;
export function group(options: GroupHelperOptions, fn: RouteDefinition): void {
  pushGroupScope(options, fn);
}

/**
 * Declare a route page at `path`, nesting a sub-scope for `index`/`page`/`fallback`
 * declarations and options like `preload`/`meta`/`auth`.
 */
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

/** Declare the index route for the enclosing `page()` scope. */
export function index(Component: RouteComponent, options?: RouteOptions): void {
  registerIndexRoute(Component, options);
}

/** Declare the catch-all `/*` fallback route for the enclosing scope. */
export function fallback(Component: RouteComponent): void {
  registerFallbackRoute(Component);
}

/** Declare a route at `path` rendering `Component`, returning a typed {@link RouteRef} for building destinations. */
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
      'Routes are not supported with islands. Use createSPA or hydrateSPA with a route registry instead.'
    );
  }

  const currentInst = getCurrentComponentInstance();
  if (currentInst && currentInst.server) {
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
