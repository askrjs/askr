import {
  RouteSnapshot,
  RouteDefinition,
  RoutePathParams,
  RenderableChild,
  PageScopeRecord,
  RouteAuthResolver,
  RouteAuthOptions,
  RouteMeta,
  RouteRefSearch,
  RouteQuery,
  RouteMetaSource,
  RouteRenderResult,
  RouteRegistry,
  RouteMode,
  RouteHandler,
  RouteManifest,
  RouteComponent,
  RouteMatch,
  RouteSearchValue,
  RouteOptions,
  PageHelperOptions,
  Route,
  RouteRecord,
  RoutePolicy,
  RouteRef,
  RouteRequestResult,
  RouteRequestOptions,
  RouteSearch,
  AccessDenyStatus,
  GroupHelperOptions,
  AccessDenyDecision,
  AccessDecision,
  RouteDestination,
  RouteContext,
  AccessAllowDecision,
  RouteRegistryOptions,
  AccessRedirectDecision,
  ParsedSegment,
  LayoutScopeRecord,
  AccessRedirectStatus,
  RouteParams,
} from '../core.js';
import { JSXElement, Props } from '../elements.js';
import {
  ScrollRestorationOptions,
  NavigationScrollBehavior,
  NavigateOptions,
  HistoryScrollBehavior,
  navigate,
} from '../navigation.js';
import {
  onRouteChange,
  RouteChangeOptions,
  currentRoute,
  RouteChangeCleanup,
} from '../route-activity.js';
import {
  AuthContext,
  AuthContext as AuthContext$1,
  AuthRequirement,
  AuthRequirement as AuthRequirement$1,
} from '@askrjs/auth';
import { ObjectSchema } from '@askrjs/schema';
/** A single query-string value accepted by {@link updateRouteQuery}. */
type RouteQueryParamValue = string | number | boolean | null | undefined;
/** A query-string value, or an array of them for a repeated param. */
type RouteQueryParamInput =
  | RouteQueryParamValue
  | readonly RouteQueryParamValue[];
/** A map of query param updates for {@link updateRouteQuery}; `null`/`undefined` removes the key. */
type RouteQueryUpdates = Record<string, RouteQueryParamInput>;
/** A function that mutates a `URLSearchParams` directly, for {@link updateRouteQuery}. */
type RouteQueryUpdater = (searchParams: URLSearchParams) => void;
/** Options for {@link updateRouteQuery}. */
type UpdateRouteQueryOptions = {
  /**
   * Defaults to replace so high-frequency controls such as search inputs do not
   * create one browser-history entry per character.
   */
  history?: 'push' | 'replace';
  replace?: boolean;
};
declare function updateRouteQuery(
  updates: RouteQueryUpdates | RouteQueryUpdater,
  options?: UpdateRouteQueryOptions
): void;
type AnyRouteComponent = (...args: any[]) => RenderableChild;
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
  TSearchSchema extends ObjectSchema<RouteSearch> | undefined =
    | ObjectSchema<RouteSearch>
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
declare function group(options: GroupHelperOptions, fn: RouteDefinition): void;
/**
 * Declare a route page at `path`, nesting a sub-scope for `index`/`page`/`fallback`
 * declarations and options like `preload`/`meta`/`auth`.
 */
declare function page<const TPath extends string>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  fn: RouteDefinition
): void;
declare function page<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  fn: RouteDefinition
): void;
declare function page<const TPath extends string>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  options: PageHelperOptions,
  fn: RouteDefinition
): void;
declare function page<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  options: PageHelperOptions,
  fn: RouteDefinition
): void;
/** Declare the index route for the enclosing `page()` scope. */
declare function index(Component: RouteComponent, options?: RouteOptions): void;
/** Declare the catch-all `/*` fallback route for the enclosing scope. */
declare function fallback(Component: RouteComponent): void;
/** Declare a route at `path` rendering `Component`, returning a typed {@link RouteRef} for building destinations. */
declare function route<
  const TPath extends string,
  const TSearchSchema extends ObjectSchema<RouteSearch> | undefined = undefined,
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
declare function route<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
  const TSearchSchema extends ObjectSchema<RouteSearch> | undefined = undefined,
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
/** Return the identity resolved for the route currently being rendered. */
declare function currentAuth(): AuthContext$1;
/** Resolve `target` against a route registry, applying auth/policies to produce a render/redirect/deny result. */
declare function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions
): RouteRequestResult | Promise<RouteRequestResult>;
/**
 * Run `definition` to declare routes (via `route`/`page`/`group`/`fallback`)
 * and build a {@link RouteRegistry} to pass to `createSPA`/`hydrateSPA`.
 */
declare function createRouteRegistry(
  definition: RouteDefinition,
  options?: RouteRegistryOptions
): RouteRegistry;
/** A route component loaded on demand via {@link lazy}, with an explicit `preload()`. */
type LazyRouteComponent<TComponent extends AnyRouteComponent> = TComponent & {
  preload(): Promise<void>;
};
/** A route data loader loaded on demand via {@link lazyRouteData}, with an explicit `preload()`. */
type LazyRouteDataLoader<TModule, TData = TModule> = ((
  context: RouteContext & {
    request?: Request;
  }
) => Promise<TData>) & {
  preload(): Promise<void>;
};
/** Wrap a dynamic-import factory as a {@link LazyRouteComponent}, loaded on first use. */
declare function lazy<TComponent extends AnyRouteComponent>(
  factory: () => Promise<
    | {
        default: TComponent;
      }
    | TComponent
  >
): LazyRouteComponent<TComponent>;
/**
 * Create a cached route loader backed by a dynamic import. The module is only
 * requested when the owning route matches, unless preload() is called.
 */
declare function lazyRouteData<TModule, TData = TModule>(
  factory: () => PromiseLike<TModule>,
  select?: (
    module: TModule,
    context: RouteContext & {
      request?: Request;
    }
  ) => TData | PromiseLike<TData>
): LazyRouteDataLoader<TModule, TData>;
/** Renders the nested route content for the enclosing layout or page scope. */
declare function Outlet(): JSXElement;
/** Which environment a route's data loader ran (or failed) in. */
type RouteDataLoadPhase = 'client' | 'server' | 'ssg';
/** Thrown when a route's `loader` rejects; wraps the original `cause`. */
declare class RouteDataLoadError extends Error {
  readonly route: string;
  readonly phase: RouteDataLoadPhase;
  readonly cause: unknown;
  constructor(route: string, phase: RouteDataLoadPhase, cause: unknown);
}
/** Policy decision: allow the route to render. */
declare function allow(): AccessAllowDecision;
/** Policy decision: redirect the visitor to `to`. */
declare function redirect(
  to: string,
  init?: {
    status?: AccessRedirectStatus;
    replace?: boolean;
  }
): AccessRedirectDecision;
/** Policy decision: deny the request with the given HTTP status. */
declare function deny(status: AccessDenyStatus): AccessDenyDecision;
/** Policy decision: deny with 401 Unauthorized. */
declare function unauthorized(): AccessDenyDecision;
/** Policy decision: deny with 403 Forbidden. */
declare function forbidden(): AccessDenyDecision;
/** Policy decision: deny with 404 Not Found. */
declare function notFound(): AccessDenyDecision;
/** Build a {@link RouteDestination} (with a computed `href`) for a {@link RouteRef} and params/search. */
declare function to$1<
  TParams extends RouteParams,
  TSearch extends RouteSearch = RouteSearch,
>(
  route: RouteRef<TParams, TSearch>,
  params: TParams,
  search?: TSearch
): RouteDestination;
/** Resolve a route's merged {@link RouteMeta} by running its metadata chain against `context`. */
declare function resolveRouteMeta(
  record: RouteRecord,
  context: RouteContext
): Promise<Readonly<RouteMeta>>;
/** Replace only Askr-owned head nodes after a successful client navigation. */
declare function reconcileRouteMeta(
  meta: Readonly<RouteMeta>,
  target?: Document
): void;
/** Render a {@link RouteMeta} to the `<title>`/`<meta>`/`<link>`/JSON-LD markup for the document `<head>`. */
declare function serializeRouteMeta(meta: RouteMeta): string;
declare const DEFERRED_VALUE: unique symbol;
/** Lifecycle state of a {@link Deferred} value. */
type DeferredState = 'pending' | 'fulfilled' | 'rejected';
/** A promise-backed value that can be read synchronously once settled, produced by {@link defer}. */
interface Deferred<T> {
  readonly state: DeferredState;
  readonly value: T | undefined;
  readonly error: unknown;
  readonly promise: Promise<T>;
  readonly [DEFERRED_VALUE]: true;
}
/** Wrap a promise as a {@link Deferred} value that tracks its settled state and result. */
declare function defer<T>(promise: PromiseLike<T>): Deferred<T>;
/** Check whether `value` is a {@link Deferred} produced by {@link defer}. */
declare function isDeferred<T = unknown>(value: unknown): value is Deferred<T>;
/** Props for {@link Resolve}. */
interface ResolveProps<T> {
  value: Deferred<T>;
  pending?: RenderableChild;
  rejected?: RenderableChild | ((error: unknown) => RenderableChild);
  children: (value: T) => RenderableChild;
}
/** Recursively await any {@link Deferred} values nested within `input`, returning it once fully resolved. */
declare function resolveDeferredValues<T>(
  input: T,
  signal?: AbortSignal
): Promise<T>;
/** Read the current route's server loader data during render or hydration. */
declare function routeData<T>(): T;
/** Render a {@link Deferred} value's fulfilled state, a pending placeholder, or a rejected fallback. */
declare function Resolve<T>(props: ResolveProps<T>): JSXElement;
type LinkBaseProps = Omit<
  Props,
  | 'children'
  | 'href'
  | 'class'
  | 'rel'
  | 'target'
  | 'aria-current'
  | 'aria-label'
> & {
  class?: string;
  children?: RenderableChild;
  /**
   * Optional rel attribute for link relationships.
   * Common values: "noopener", "noreferrer", "nofollow"
   */
  rel?: string;
  /**
   * Optional target attribute.
   * Use "_blank" for new tab/window.
   */
  target?: string;
  /**
   * Optional aria-current attribute for indicating current page/location.
   * Use "page" for the current page in navigation.
   */
  'aria-current'?:
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | 'true'
    | 'false';
  /**
   * Optional aria-label for accessibility when link text isn't descriptive enough.
   */
  'aria-label'?: string;
  onPress?: (event: Event) => void;
  onClick?: (event: MouseEvent) => void;
};
/** Props for {@link Link}: either a raw `href` or a typed route `to` destination. */
type LinkProps = LinkBaseProps &
  (
    | {
        href: string;
        to?: never;
      }
    | {
        href?: never;
        to: RouteDestination;
      }
  );
/**
 * Link component that prevents default navigation and uses navigate()
 * Provides declarative way to navigate between routes
 *
 * Accessibility features:
 * - Proper semantic <a> element (not a button)
 * - Supports aria-current for indicating active page
 * - Supports aria-label for descriptive labels
 * - Keyboard accessible (Enter key handled by native <a> element)
 *
 * Respects native browser behaviors:
 * - Middle-click (opens in new tab)
 * - Ctrl/Cmd+click (opens in new tab)
 * - Shift+click (opens in new window)
 * - Alt+click (downloads link)
 * - Right-click context menu
 *
 * Best practices:
 * - Use target="_blank" with rel="noopener noreferrer" for external links
 * - Use aria-current="page" for the current page in navigation
 * - Provide descriptive link text or aria-label
 * - For a styled link with automatic active-route state, install
 *   `@askrjs/themes` and use `NavLink` from `@askrjs/themes/components`
 *
 * Uses applyInteractionPolicy to enforce pit-of-success principles:
 * - Interaction behavior centralized in foundations
 * - Keyboard handling automatic
 * - Composable via mergeProps
 */
declare function Link({
  href: suppliedHref,
  to,
  class: className,
  children,
  rel,
  target,
  'aria-current': ariaCurrent,
  'aria-label': ariaLabel,
  onPress,
  onClick,
  ...rest
}: LinkProps): JSXElement;
export {
  type AccessDecision,
  type AccessDenyDecision,
  type AccessRedirectDecision,
  type AuthContext,
  type AuthRequirement,
  type Deferred,
  type DeferredState,
  type GroupHelperOptions,
  type HistoryScrollBehavior,
  type LayoutScopeRecord,
  type LazyRouteComponent,
  type LazyRouteDataLoader,
  Link,
  type LinkProps,
  type NavigateOptions,
  type NavigationScrollBehavior,
  Outlet,
  type PageHelperOptions,
  type PageScopeRecord,
  type ParsedSegment,
  Resolve,
  type ResolveProps,
  type Route,
  type RouteAuthOptions,
  type RouteAuthResolver,
  type RouteChangeCleanup,
  type RouteChangeOptions,
  type RouteComponent,
  type RouteContext,
  RouteDataLoadError,
  type RouteDataLoadPhase,
  type RouteDefinition,
  type RouteDestination,
  type RouteHandler,
  type RouteManifest,
  type RouteMatch,
  type RouteMeta,
  type RouteMetaSource,
  type RouteMode,
  type RouteOptions,
  type RouteParams,
  type RoutePathParams,
  type RoutePolicy,
  type RouteQuery,
  type RouteQueryParamInput,
  type RouteQueryParamValue,
  type RouteQueryUpdater,
  type RouteQueryUpdates,
  type RouteRecord,
  type RouteRef,
  type RouteRegistry,
  type RouteRegistryOptions,
  type RouteRenderResult,
  type RouteRequestOptions,
  type RouteRequestResult,
  type RouteSearch,
  type RouteSearchValue,
  type RouteSnapshot,
  type ScrollRestorationOptions,
  type UpdateRouteQueryOptions,
  allow,
  createRouteRegistry,
  currentAuth,
  currentRoute,
  defer,
  deny,
  fallback,
  forbidden,
  group,
  index,
  isDeferred,
  lazy,
  lazyRouteData,
  navigate,
  notFound,
  onRouteChange,
  page,
  reconcileRouteMeta,
  redirect,
  resolveDeferredValues,
  resolveRouteMeta,
  resolveRouteRequest,
  route,
  routeData,
  serializeRouteMeta,
  to$1 as to,
  unauthorized,
  updateRouteQuery,
};
