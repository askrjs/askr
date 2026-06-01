/**
 * Route definition, registration, and matching.
 *
 * Primary public authoring:
 *   - `registerRoutes(() => { ... }, options?)`
 *   - `group(options, () => { ... })`
 *   - `page(path, Component, () => { ... })`
 *   - `index(Component, options?)`
 *   - `route(path, Component, options?)`
 *   - `fallback(Component)`
 *   - `Outlet()` for page child rendering
 *   - `currentRoute()` for render-time access
 *
 */

import {
  matchSegments,
  parseSegments,
  computeRank,
  splitPathSegments,
} from './match';
import {
  buildRouteContext,
  buildRouteContextBase,
  deepFreeze,
  makeQuery,
  parseLocation,
} from './route-context';
import { defineContext, readContext } from '../runtime/context';
import { getCurrentComponentInstance } from '../runtime/component';
import { getExecutionModel } from '../runtime/execution-model';
import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../runtime/readable';
import { getRenderContext } from '../ssr/context';
import {
  requireAuth,
  requireGuest,
  requirePermission,
  requireRole,
} from './policy';
import { isPromiseLike } from '../common/promise';
import { ELEMENT_TYPE, Fragment, type JSXElement } from '../common/jsx';
import type { RenderableChild } from '../common/vnode';

export type {
  AccessDecision,
  AccessDenyDecision,
  AccessRedirectDecision,
  GroupHelperOptions,
  PageHelperOptions,
  RegisterRoutesOptions,
  RouteDefinition,
  RouteAuthOptions,
  RouteHandler,
  Route,
  RouteContext,
  RoutePolicy,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
  RouteParams,
  RoutePathParams,
  RouteComponent,
  RouteOptions,
  ParsedSegment,
  LayoutScopeRecord,
  PageScopeRecord,
  RouteRecord,
  RouteManifest,
} from '../common/router';

import type {
  GroupHelperOptions,
  PageHelperOptions,
  RegisterRoutesOptions,
  RouteDefinition,
  RouteAuthOptions,
  RouteHandler,
  Route,
  RouteContext,
  RoutePolicy,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
  ResolvedRoute,
  RouteMatch,
  RouteSnapshot,
  RouteParams,
  RoutePathParams,
  RouteComponent,
  RouteOptions,
  LayoutScopeRecord,
  PageScopeRecord,
  RouteRecord,
  RouteManifest,
} from '../common/router';
import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';

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
> =
  Parameters<TComponent> extends []
    ? RouteOptions<RoutePathParams<Path>>
    : RouteComponentParam<TComponent> extends RouteParams
      ? RouteOptions<RouteComponentParam<TComponent>>
      : RouteOptions<RoutePathParams<Path>>;

// ---------------------------------------------------------------------------
// Module-level stores
// ---------------------------------------------------------------------------

/** Legacy flat route array — kept for resolver and route() accessor backward compat. */
type InternalRoute = Route & {
  fallbackPrefix?: string;
};

type InternalRouteRecord = RouteRecord & {
  fallbackPrefix?: string;
  renderHandler?: RouteHandler;
};

const routes: InternalRoute[] = [];

/** Normalized route records built by the declarative registration API. */
const records: InternalRouteRecord[] = [];

type RegistrationScope = {
  kind: 'group' | 'page';
  pathPrefix: string;
  layout?: LayoutScopeRecord['component'];
  page?: PageScopeRecord['component'];
  hasIndex?: boolean;
  policies: readonly RoutePolicy[];
  state: AccessScopeState;
};

type RegistrationSession = {
  authConfigured: boolean;
};

/** Active registration scope stack during module-load-time registration. */
const registrationScopeStack: RegistrationScope[] = [];
const registrationSessionStack: RegistrationSession[] = [];

const namespaces = new Set<string>();
let registrationLocked = false;

type AccessScopeState = {
  guestOnly: boolean;
  authenticated: boolean;
};

let defaultRouteAuthOptions: RouteAuthOptions | undefined;
let activeClientRouteAuthOptions: RouteAuthOptions | undefined;

const HAS_ROUTES_KEY = Symbol.for('__ASKR_HAS_ROUTES__');

function setHasRoutes(value: boolean): void {
  try {
    const g = globalThis as unknown as Record<string | symbol, unknown>;
    g[HAS_ROUTES_KEY] = value;
  } catch {
    // ignore
  }
}

// Initialize to false at module load.
setHasRoutes(false);

// Route index by depth - maintains insertion order
const routesByDepth = new Map<number, Route[]>();

/**
 * Parse route path depth
 */
function getDepth(path: string): number {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  return normalized === '/' ? 0 : normalized.split('/').filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// WeakMap caches for external Route[] objects (e.g. SSR per-request tables)
// Amortises parseSegments / computeRank across repeated resolveRouteFromRoutes
// calls on the same route list (same object reference).
// ---------------------------------------------------------------------------

/** Pre-parsed segments for an externally supplied Route object. */
const routeSegsCache = new WeakMap<Route, ReturnType<typeof parseSegments>>();
/** Pre-computed rank for an externally supplied Route object. */
const routeRankCache = new WeakMap<Route, number>();
/** A rank-descending sorted copy of an external readonly Route array. */
const sortedListCache = new WeakMap<
  ReadonlyArray<Route>,
  ReadonlyArray<Route>
>();

function cachedSegs(r: Route): ReturnType<typeof parseSegments> {
  let s = routeSegsCache.get(r);
  if (!s) {
    s = parseSegments(r.path);
    routeSegsCache.set(r, s);
  }
  return s;
}

function cachedRank(r: Route): number {
  let n = routeRankCache.get(r);
  if (n === undefined) {
    n = computeRank(cachedSegs(r));
    routeRankCache.set(r, n);
  }
  return n;
}

function cachedSortedList(
  routeList: ReadonlyArray<Route>
): ReadonlyArray<Route> {
  let sorted = sortedListCache.get(routeList);
  if (!sorted) {
    sorted = [...routeList].sort((a, b) => cachedRank(b) - cachedRank(a));
    sortedListCache.set(routeList, sorted);
  }
  return sorted;
}

let currentRouteSnapshot = buildRouteSnapshot('/', '', '');

const currentRouteSource = (() =>
  currentRouteSnapshot) as ReadableSource<RouteSnapshot> &
  (() => RouteSnapshot);

currentRouteSource._readers = new Map();

// SSR helper: when rendering on the server, callers may set a location so that
// render-time route() returns deterministic server values that match client
// hydration. This is deliberately an opt-in escape for SSR and tests.
let serverLocation: string | null = null;

export function setServerLocation(url: string | null): void {
  serverLocation = url;
}

function buildRouteSnapshot(
  pathname: string,
  search: string,
  hash: string
): RouteSnapshot {
  const query = makeQuery(search);
  const matches = computeMatchesFromRoutes(pathname, getActiveRoutes());

  return Object.freeze({
    path: pathname,
    params: deepFreeze({ ...matches[0]?.params }),
    query,
    hash: hash || null,
    matches: Object.freeze(matches),
  });
}

function setCurrentRouteSnapshot(
  pathname: string,
  search: string,
  hash: string
): void {
  currentRouteSnapshot = buildRouteSnapshot(pathname, search, hash);

  const instance = getCurrentComponentInstance();
  markReadableDerivedSubscribersDirty(currentRouteSource);
  markReactivePropsDirtySource(currentRouteSource);
  notifyReadableReaders(currentRouteSource, instance);
}

// Compute matches for a specific route list.
function matchFallbackPrefix(
  pathname: string,
  fallbackPrefix: string
): Record<string, string> | null {
  const normalizedPath =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const normalizedPrefix =
    fallbackPrefix.endsWith('/') && fallbackPrefix !== '/'
      ? fallbackPrefix.slice(0, -1)
      : fallbackPrefix;

  if (normalizedPrefix === '/') {
    const urlParts = splitPathSegments(normalizedPath);
    return {
      '*':
        urlParts.length === 0
          ? '/'
          : urlParts.length === 1
            ? urlParts[0]
            : '/' + urlParts.join('/'),
    };
  }

  if (
    normalizedPath !== normalizedPrefix &&
    !normalizedPath.startsWith(`${normalizedPrefix}/`)
  ) {
    return null;
  }

  const remainder =
    normalizedPath === normalizedPrefix
      ? '/'
      : normalizedPath.slice(normalizedPrefix.length);
  const remainderParts = splitPathSegments(remainder);

  return {
    '*':
      remainderParts.length === 0
        ? '/'
        : remainderParts.length === 1
          ? remainderParts[0]
          : '/' + remainderParts.join('/'),
  };
}

function computeMatchesFromRoutes(
  pathname: string,
  routesList: readonly Route[]
): RouteMatch[] {
  const bestMatch =
    routesList === routes
      ? getMatchingRecord(pathname, records)
      : findBestResolvedRouteFromRoutes(pathname, routesList);

  if (!bestMatch) {
    return [];
  }

  return [
    {
      path: 'route' in bestMatch ? bestMatch.route.path : bestMatch.record.path,
      params: deepFreeze({ ...bestMatch.params }),
      name:
        'route' in bestMatch
          ? (bestMatch.route as { name?: string }).name
          : undefined,
      namespace:
        'route' in bestMatch
          ? bestMatch.route.namespace
          : bestMatch.record.options.namespace,
    },
  ];
}

function findBestResolvedRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): { route: Route; params: Record<string, string> } | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts = splitPathSegments(normalized);

  const sorted = cachedSortedList(routeList);
  let bestRoute: Route | null = null;
  let bestParams: Record<string, string> = {};
  let bestRank = -Infinity;

  for (const route of sorted) {
    const internalRoute = route as InternalRoute;
    if (internalRoute.fallbackPrefix) {
      continue;
    }

    const rank = cachedRank(route);
    if (rank < bestRank) break;
    if (bestRoute !== null && rank === bestRank) continue;

    const params = matchSegments(urlParts, cachedSegs(route));
    if (params !== null) {
      bestRoute = route;
      bestParams = params;
      bestRank = rank;
    }
  }

  if (bestRoute !== null) {
    return { route: bestRoute, params: bestParams };
  }

  let bestFallback: InternalRoute | null = null;
  let bestFallbackParams: Record<string, string> | null = null;
  let bestPrefixLength = -1;

  for (const route of routeList) {
    const internalRoute = route as InternalRoute;
    if (!internalRoute.fallbackPrefix) {
      continue;
    }

    const params = matchFallbackPrefix(
      normalized,
      internalRoute.fallbackPrefix
    );
    if (params === null) {
      continue;
    }

    if (internalRoute.fallbackPrefix.length > bestPrefixLength) {
      bestFallback = internalRoute;
      bestFallbackParams = params;
      bestPrefixLength = internalRoute.fallbackPrefix.length;
    }
  }

  return bestFallback && bestFallbackParams
    ? { route: bestFallback, params: bestFallbackParams }
    : null;
}

function getActiveRoutes(): readonly Route[] {
  const renderContext = getRenderContext();
  return renderContext?.routes ?? routes;
}

function getActiveRouteAuthOptions(
  override?: RouteAuthOptions
): RouteAuthOptions | undefined {
  if (override) {
    return override;
  }

  const renderContext = getRenderContext();
  return (
    renderContext?.routeAuth ??
    activeClientRouteAuthOptions ??
    defaultRouteAuthOptions
  );
}

export function _setActiveRouteAuthOptions(
  auth: RouteAuthOptions | undefined
): void {
  activeClientRouteAuthOptions = auth;
}

function getCurrentRegistrationSession(): RegistrationSession {
  return (
    registrationSessionStack[registrationSessionStack.length - 1] ?? {
      authConfigured: !!defaultRouteAuthOptions?.resolve,
    }
  );
}

function getCurrentAccessScopeState(): AccessScopeState {
  return (
    registrationScopeStack[registrationScopeStack.length - 1]?.state ?? {
      guestOnly: false,
      authenticated: false,
    }
  );
}

function getCurrentLayoutChain(): LayoutScopeRecord[] {
  const layoutChain: LayoutScopeRecord[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.layout) {
      layoutChain.push({ component: scope.layout });
    }
  }

  return layoutChain;
}

function getCurrentPageChain(): PageScopeRecord[] {
  const pageChain: PageScopeRecord[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.page) {
      pageChain.push({ component: scope.page });
    }
  }

  return pageChain;
}

function hasActivePageScope(): boolean {
  return registrationScopeStack.some((scope) => !!scope.page);
}

function getCurrentPageScope(): RegistrationScope | null {
  for (let index = registrationScopeStack.length - 1; index >= 0; index -= 1) {
    const scope = registrationScopeStack[index];
    if (scope.kind === 'page') {
      return scope;
    }
  }

  return null;
}

function getCurrentScopeKind(): RegistrationScope['kind'] | null {
  return (
    registrationScopeStack[registrationScopeStack.length - 1]?.kind ?? null
  );
}

function getCurrentPathPrefix(): string {
  return (
    registrationScopeStack[registrationScopeStack.length - 1]?.pathPrefix ?? ''
  );
}

function getCurrentInheritedPolicies(): RoutePolicy[] {
  const policies: RoutePolicy[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.policies.length > 0) {
      policies.push(...scope.policies);
    }
  }

  return policies;
}

// ---------------------------------------------------------------------------
// Registration lock
// ---------------------------------------------------------------------------

/**
 * Prevent route registrations after the app has started.
 * Enforced in production; tests may unlock explicitly.
 */

export function lockRouteRegistration(): void {
  registrationLocked = true;
}

export function _lockRouteRegistrationForTests(): void {
  registrationLocked = true;
}

export function _unlockRouteRegistrationForTests(): void {
  registrationLocked = false;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function validateRoutePath(path: string): void {
  if (!path.startsWith('/')) {
    throw new Error(`Route path must begin with "/". Got: "${path}"`);
  }
  if (/\/{2,}/.test(path)) {
    throw new Error('Route path cannot contain consecutive slashes.');
  }
  // Reject Express-style :param syntax — Askr uses {param} interpolation
  if (/:([^/{}]+)/.test(path)) {
    const suggested = path.replace(/:([^/{}]+)/g, '{$1}');
    throw new Error(
      `Route parameter syntax uses {name} interpolation, not :name. ` +
        `Use "${suggested}" instead of "${path}".`
    );
  }

  const segments = path.split('/').filter(Boolean);
  const seenParamNames = new Set<string>();

  for (const segment of segments) {
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

    const paramName = segment.slice(1, -1).trim();

    if (!paramName) {
      throw new Error('Route parameter name cannot be empty.');
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

// ---------------------------------------------------------------------------
// Internal helper: insert a RouteRecord in rank-descending order
// so that resolveRoute can use first-match-wins without sorting.
// Ties preserve declaration order (stable binary-search insertion).
// ---------------------------------------------------------------------------

function insertRecordSorted(record: RouteRecord): void {
  let lo = 0;
  let hi = records.length;
  // Find the insertion point: after all existing records with rank >= this one
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].rank >= record.rank) lo = mid + 1;
    else hi = mid;
  }
  records.splice(lo, 0, record);
}

// ---------------------------------------------------------------------------
// Internal helper: add a single pre-built Route object to the runtime stores
// ---------------------------------------------------------------------------

function addRouteToStores(routeObj: Route): void {
  routes.push(routeObj);
  setHasRoutes(true);

  const depth = getDepth(routeObj.path);
  let depthRoutes = routesByDepth.get(depth);
  if (!depthRoutes) {
    depthRoutes = [];
    routesByDepth.set(depth, depthRoutes);
  }
  depthRoutes.push(routeObj);

  if (routeObj.namespace) {
    namespaces.add(routeObj.namespace);
  }
}

// ---------------------------------------------------------------------------
// lazy() — eager-prefetch code-split component wrapper
// ---------------------------------------------------------------------------

/** Promises from in-flight lazy() imports, drained by createSPA / hydrateSPA. */
const pendingLazy = new Set<Promise<unknown>>();

const outletContext = defineContext<RenderableChild>(null);

export function Outlet(): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children: readContext(outletContext) },
    key: null,
  };
}

/**
 * Snapshot the current in-flight lazy() imports.
 * Boot uses this before clearing route state so manifest-based startup can
 * still await chunks that were kicked off during route module evaluation.
 */
export function _snapshotLazy(): Promise<unknown>[] {
  return [...pendingLazy];
}

/**
 * Declare a code-split route component. The `import()` fires immediately at
 * module evaluation time (creating a bundler split point), and the resolved
 * chunk is guaranteed to be available before the app mounts — so the renderer
 * always receives a plain synchronous function.
 *
 * ```ts
 * registerRoutes(() => {
 *   group({ layout: AppLayout }, () => {
 *     route('/', lazy(() => import('./pages/landing')));
 *     route('/dashboard', lazy(() => import('./pages/dashboard')));
 *   });
 * });
 * ```
 *
 * The module must export the component as its **default** export:
 * ```ts
 * // pages/dashboard.tsx
 * export default function DashboardPage() { … }
 * ```
 */
export function lazy<TComponent extends AnyRouteComponent>(
  factory: () => Promise<{ default: TComponent } | TComponent>
): TComponent {
  let resolved: TComponent | null = null;
  let loadError: unknown = null;

  const promise = factory().then(
    (mod) => {
      resolved =
        typeof mod === 'function'
          ? mod
          : (mod as { default: TComponent }).default;
      pendingLazy.delete(promise);
    },
    (err: unknown) => {
      loadError = err;
      pendingLazy.delete(promise);
    }
  );
  pendingLazy.add(promise);

  return ((params: RouteParams) => {
    if (loadError) throw loadError as Error;
    if (!resolved) {
      throw new Error(
        'lazy() component used before it was resolved. ' +
          'Await createSPA() / hydrateSPA() to ensure all chunks load first.'
      );
    }
    return (resolved as RouteComponent<RouteParams>)(params);
  }) as TComponent;
}

/**
 * Wait for all pending `lazy()` imports to settle.
 * Called automatically by `createSPA` / `hydrateSPA` before mounting.
 */
export function _drainLazy(
  additionalPending: Iterable<Promise<unknown>> = []
): Promise<void> {
  const combined = new Set<Promise<unknown>>([
    ...additionalPending,
    ...pendingLazy,
  ]);
  if (combined.size === 0) return Promise.resolve();
  return Promise.allSettled(combined).then(() => undefined);
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

  const allowsRootFallback = registrationScopeStack.every(
    (scope) =>
      scope.policies.length === 0 &&
      !scope.state.guestOnly &&
      !scope.state.authenticated
  );

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

function pushRegistrationScope(
  scope: RegistrationScope,
  fn: RouteDefinition
): void {
  registrationScopeStack.push(scope);
  try {
    fn();
  } finally {
    registrationScopeStack.pop();
  }
}

function pushGroupScope(
  options: GroupHelperOptions,
  fn: RouteDefinition
): void {
  const session = getCurrentRegistrationSession();
  validateAccessMetadata(options, {
    authConfigured: session.authConfigured,
    state: getCurrentAccessScopeState(),
  });
  const policies = compileNodePolicies(options);

  pushRegistrationScope(
    {
      kind: 'group',
      pathPrefix: getCurrentPathPrefix(),
      layout: options.layout,
      policies,
      state: nextAccessScopeState(options, getCurrentAccessScopeState()),
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

  const session = getCurrentRegistrationSession();
  validateAccessMetadata(options, {
    authConfigured: session.authConfigured,
    state: getCurrentAccessScopeState(),
  });

  const policies = compileNodePolicies(options);

  pushRegistrationScope(
    {
      kind: 'page',
      pathPrefix: resolvePageScopePath(path),
      page: Component,
      hasIndex: false,
      policies,
      state: nextAccessScopeState(options, getCurrentAccessScopeState()),
    },
    fn
  );
}

function hasBuiltInAuthMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>
): boolean {
  return node.auth !== undefined || !!node.role || !!node.permission;
}

function validateSameNodeAccessMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>
): void {
  if (node.auth === 'guest' && (!!node.role || !!node.permission)) {
    throw new Error(
      'Guest-only routes cannot be combined with role or permission requirements.'
    );
  }
}

function validateAccessMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>,
  context: {
    authConfigured: boolean;
    state: AccessScopeState;
  }
): void {
  validateSameNodeAccessMetadata(node);

  const requiresAuthenticated =
    node.auth === true || !!node.role || !!node.permission;

  if (
    node.auth === 'guest' &&
    (context.state.authenticated || !!node.role || !!node.permission)
  ) {
    throw new Error(
      'Guest-only routes cannot be combined with authenticated access requirements.'
    );
  }

  if (context.state.guestOnly && requiresAuthenticated) {
    throw new Error(
      'Child routes cannot weaken a guest-only access scope with authenticated requirements.'
    );
  }

  if (hasBuiltInAuthMetadata(node) && !context.authConfigured) {
    throw new Error(
      'Routes using `auth`, `role`, or `permission` require `auth.resolve` in registerRoutes(...).'
    );
  }
}

function nextAccessScopeState(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>,
  state: AccessScopeState
): AccessScopeState {
  const requiresAuthenticated =
    node.auth === true || !!node.role || !!node.permission;

  return {
    guestOnly: state.guestOnly || node.auth === 'guest',
    authenticated: state.authenticated || requiresAuthenticated,
  };
}

function compileNodePolicies(
  node: Pick<
    RouteOptions | GroupHelperOptions,
    'auth' | 'role' | 'permission' | 'policies'
  >
): RoutePolicy[] {
  validateSameNodeAccessMetadata(node);

  const compiled: RoutePolicy[] = [];

  if (node.auth === true) {
    compiled.push(requireAuth());
  } else if (node.auth === 'guest') {
    compiled.push(requireGuest());
  }

  if (node.role) {
    compiled.push(requireRole(node.role));
  }

  if (node.permission) {
    compiled.push(requirePermission(node.permission));
  }

  if (node.policies?.length) {
    compiled.push(...node.policies);
  }

  return compiled;
}

function normalizeRouteOptions(
  options: RouteOptions | undefined
): RouteOptions | undefined {
  if (!options) {
    return undefined;
  }

  const loader = options.loader;
  const policies = compileNodePolicies(options);

  if (
    !loader &&
    !options.entries &&
    policies.length === 0 &&
    !options.title &&
    !options.namespace &&
    options.auth === undefined &&
    !options.role &&
    !options.permission
  ) {
    return undefined;
  }

  return {
    ...(loader ? { loader } : {}),
    ...(options.entries ? { entries: options.entries } : {}),
    ...(options.auth !== undefined ? { auth: options.auth } : {}),
    ...(options.role ? { role: options.role } : {}),
    ...(options.permission ? { permission: options.permission } : {}),
    ...(policies.length > 0 ? { policies } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.namespace ? { namespace: options.namespace } : {}),
  };
}

function applyPageChain(
  pageChain: readonly PageScopeRecord[],
  params: Record<string, string>,
  content: RenderableChild,
  deferComponents = false
): RenderableChild {
  let nextContent = content;

  for (let i = pageChain.length - 1; i >= 0; i--) {
    nextContent = outletContext.Scope({
      value: nextContent,
      children: deferComponents
        ? createRouteComponentVNode(pageChain[i].component, params)
        : pageChain[i].component(params),
    });
  }

  return nextContent;
}

function createRouteComponentVNode(
  component: RouteComponent,
  params: Record<string, string>,
  routeRoot = false
): RenderableChild {
  return {
    $$typeof: ELEMENT_TYPE,
    type: component,
    props: params,
    key: null,
    ...(routeRoot ? { [ROUTE_ROOT_COMPONENT]: true } : {}),
  };
}

function createRouteHandler(
  component: RouteComponent,
  pageChain: readonly PageScopeRecord[],
  layoutChain: readonly LayoutScopeRecord[],
  deferComponents = false
): RouteHandler {
  return (params) => {
    let content = deferComponents
      ? createRouteComponentVNode(component, params, true)
      : component(params);

    content = applyPageChain(pageChain, params, content, deferComponents);

    for (let i = layoutChain.length - 1; i >= 0; i--) {
      content = layoutChain[i].component({ children: content });
    }

    return content;
  };
}

function getRenderHandler(record: RouteRecord): RouteHandler {
  const internalRecord = record as InternalRouteRecord;
  return (
    internalRecord.renderHandler ??
    createRouteHandler(
      record.component,
      record.pageChain,
      record.layoutChain,
      true
    )
  );
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

  validateAccessMetadata(options ?? {}, {
    authConfigured: getCurrentRegistrationSession().authConfigured,
    state: getCurrentAccessScopeState(),
  });

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
          ...(policies.length > 0 ? { policies } : {}),
        }
      : policies.length > 0
        ? { policies }
        : {},
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

export function registerRoutes(
  definition: RouteDefinition,
  options: RegisterRoutesOptions = {}
): void {
  defaultRouteAuthOptions = options.auth;

  registrationSessionStack.push({
    authConfigured: !!options.auth?.resolve,
  });
  try {
    definition();
  } finally {
    registrationSessionStack.pop();
  }
}

// ---------------------------------------------------------------------------
// route() — dual-purpose: registration (module load) + accessor (render time)
// ---------------------------------------------------------------------------

function readCurrentRouteSnapshot<
  TParams extends RouteParams = RouteParams,
>(): RouteSnapshot<TParams> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  let pathname = '/';
  let search = '';
  let hash = '';
  const renderContext = getRenderContext();

  if (instance.ssr && renderContext?.url) {
    const parsed = parseLocation(renderContext.url);
    pathname = parsed.pathname;
    search = parsed.search;
    hash = parsed.hash;
  } else if (typeof window !== 'undefined' && window.location) {
    pathname = window.location.pathname || '/';
    search = window.location.search || '';
    hash = window.location.hash || '';
  } else if (serverLocation) {
    const parsed = parseLocation(serverLocation);
    pathname = parsed.pathname;
    search = parsed.search;
    hash = parsed.hash;
  }

  const query = makeQuery(search);
  const matches = computeMatchesFromRoutes(pathname, getActiveRoutes());
  const instanceParams = instance.props as Record<string, string>;
  const routeParams =
    Object.keys(instanceParams).length > 0
      ? instanceParams
      : (matches[0]?.params ?? {});
  const params = deepFreeze({
    ...routeParams,
  });

  return Object.freeze({
    path: pathname,
    params,
    query,
    hash: hash || null,
    matches: Object.freeze(matches),
  }) as RouteSnapshot<TParams>;
}

export function currentRoute<
  TParams extends RouteParams = RouteParams,
>(): RouteSnapshot<TParams> {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      'currentRoute() can only be called during component render execution. ' +
        'Call currentRoute() from inside your component function.'
    );
  }

  if (typeof window === 'undefined' || instance.ssr) {
    return readCurrentRouteSnapshot<TParams>();
  }

  recordReadableRead(currentRouteSource);
  return readCurrentRouteSnapshot<TParams>();
}

export function syncCurrentRouteSnapshot(
  pathname: string,
  search: string,
  hash: string
): void {
  setCurrentRouteSnapshot(pathname, search, hash);
}

/**
 * Register a route.
 *
 * ```ts
 * route('/posts/{slug}', PostPage, {
 *   loader:  ({ params }) => getPost(params.slug),
 *   entries: async () => getPosts().map(p => ({ slug: p.slug })),
 *   title:   'Post',
 *   policies:[requireAuth()],
 * });
 * ```
 */
export function route<const TPath extends string>(
  path: TPath,
  Component: RouteComponent<RoutePathParams<TPath>>,
  options?: RouteOptions<RoutePathParams<TPath>>
): void;
export function route<
  const TPath extends string,
  TComponent extends AnyRouteComponent,
>(
  path: TPath,
  Component: CompatibleRouteComponent<TPath, TComponent>,
  options?: RouteOptionsForComponent<TPath, TComponent>
): void;
export function route(
  path: string,
  Component: RouteComponent,
  options?: RouteOptions
): void {
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

  // ── Registration mode ────────────────────────────────────────────────────

  // Disallow registration during SSR render
  const currentInst = getCurrentComponentInstance();
  if (currentInst && currentInst.ssr) {
    throw new Error(
      'route() cannot be called during SSR rendering. Register routes at module load time instead.'
    );
  }

  if (registrationLocked) {
    throw new Error(
      'Route registration is locked after app startup. ' +
        'Register routes at module load time before calling createSPA or createSSR.'
    );
  }

  if (typeof Component !== 'function') {
    throw new Error(
      'route(path, Component) requires a component function as the second argument. ' +
        'Passing JSX elements or VNodes directly is not supported.'
    );
  }

  registerRouteAtResolvedPath(
    resolveRouteRegistrationPath(path),
    Component,
    options
  );
}

// ---------------------------------------------------------------------------
// Manifest access
// ---------------------------------------------------------------------------

/**
 * Return the normalized route manifest built from registered route definitions.
 *
 * Pass this to `createSPA`, `hydrateSPA`, or `renderToString` as the
 * authoritative routing input:
 *
 * ```ts
 * import { getManifest } from '@askrjs/askr/router';
 * await createSPA({ root: '#app', manifest: getManifest() });
 * ```
 */
export function getManifest(): RouteManifest {
  return {
    records: [...records],
    ...(defaultRouteAuthOptions ? { auth: defaultRouteAuthOptions } : {}),
  };
}

/**
 * Internal: apply a pre-built manifest to the runtime stores without running
 * route() again. Called by createSPA / hydrateSPA when a manifest is passed.
 */
export function _applyManifest(manifest: RouteManifest): void {
  defaultRouteAuthOptions = manifest.auth;
  for (const record of manifest.records) {
    insertRecordSorted(record as InternalRouteRecord);
    addRouteToStores({
      path: record.path,
      handler: record.handler,
      namespace: record.options.namespace,
      ...('fallbackPrefix' in record &&
      typeof (record as InternalRouteRecord).fallbackPrefix === 'string'
        ? {
            fallbackPrefix: (record as InternalRouteRecord).fallbackPrefix,
          }
        : {}),
    });
  }
}

// ---------------------------------------------------------------------------
// Route collection helpers
// ---------------------------------------------------------------------------

/**
 * Get all registered routes (flat list, insertion order).
 * Prefer `getManifest()` when metadata (loader, policies, entries) is needed.
 */
export function getRoutes(): Route[] {
  return [...routes];
}

/** Get routes for a specific namespace. */
export function getNamespaceRoutes(namespace: string): Route[] {
  return routes.filter((r) => r.namespace === namespace);
}

/** Unload all routes from a namespace (for MFE unmounting). */
export function unloadNamespace(namespace: string): number {
  const before = routes.length;

  for (let i = routes.length - 1; i >= 0; i--) {
    if (routes[i].namespace === namespace) {
      const removed = routes[i];
      routes.splice(i, 1);

      const depth = getDepth(removed.path);
      const depthRoutes = routesByDepth.get(depth);
      if (depthRoutes) {
        const idx = depthRoutes.indexOf(removed);
        if (idx >= 0) depthRoutes.splice(idx, 1);
      }
    }
  }

  // Remove matching records too
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].options.namespace === namespace) {
      records.splice(i, 1);
    }
  }

  namespaces.delete(namespace);
  return before - routes.length;
}

/** Clear all registered routes and records (testing / boot reset). */
export function clearRoutes(): void {
  routes.length = 0;
  records.length = 0;
  namespaces.clear();
  routesByDepth.clear();
  registrationScopeStack.length = 0;
  registrationSessionStack.length = 0;
  registrationLocked = false;
  defaultRouteAuthOptions = undefined;
  activeClientRouteAuthOptions = undefined;
  setHasRoutes(false);
  pendingLazy.clear();
}

/**
 * Get all loaded namespaces (MFE identifiers)
 */
export function getLoadedNamespaces(): string[] {
  return Array.from(namespaces);
}

function findBestScopedFallbackRecord(
  pathname: string,
  routeRecords: readonly RouteRecord[]
): { record: InternalRouteRecord; params: Record<string, string> } | null {
  let bestRecord: InternalRouteRecord | null = null;
  let bestParams: Record<string, string> | null = null;
  let bestPrefixLength = -1;

  for (const routeRecord of routeRecords) {
    const record = routeRecord as InternalRouteRecord;
    if (!record.fallbackPrefix) {
      continue;
    }

    const params = matchFallbackPrefix(pathname, record.fallbackPrefix);
    if (params === null) {
      continue;
    }

    if (record.fallbackPrefix.length > bestPrefixLength) {
      bestRecord = record;
      bestParams = params;
      bestPrefixLength = record.fallbackPrefix.length;
    }
  }

  return bestRecord && bestParams
    ? { record: bestRecord, params: bestParams }
    : null;
}

/**
 * Resolve a path to a route handler.
 *
 * Hot path: walks the module-level `records[]` array which is kept sorted by
 * rank descending at registration time — so the first `matchSegments` hit is
 * always the most specific match.  No per-call allocations for the common
 * case of purely-static routes.
 */
export function resolveRoute(pathname: string): ResolvedRoute | null {
  const normalized =
    pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname;
  const urlParts = splitPathSegments(normalized);

  for (const record of records) {
    if (record.fallbackPrefix) {
      continue;
    }

    const params = matchSegments(urlParts, record.segments);
    if (params !== null) {
      return { handler: record.handler, params };
    }
  }

  const fallbackMatch = findBestScopedFallbackRecord(normalized, records);
  return fallbackMatch
    ? { handler: fallbackMatch.record.handler, params: fallbackMatch.params }
    : null;
}

function getMatchingRecord(
  target: string,
  routeRecords: readonly RouteRecord[]
): { record: RouteRecord; params: Record<string, string> } | null {
  const location = parseLocation(target);
  const normalized =
    location.pathname.endsWith('/') && location.pathname !== '/'
      ? location.pathname.slice(0, -1)
      : location.pathname;
  const urlParts = splitPathSegments(normalized);

  for (const record of routeRecords) {
    const internalRecord = record as InternalRouteRecord;
    if (internalRecord.fallbackPrefix) {
      continue;
    }

    const params = matchSegments(urlParts, record.segments);
    if (params !== null) {
      return { record, params };
    }
  }

  return findBestScopedFallbackRecord(normalized, routeRecords);
}

function getRoutePolicies(
  options: RouteOptions | undefined
): readonly RoutePolicy[] {
  if (!options) {
    return [];
  }

  if (options.policies?.length) {
    return options.policies;
  }

  return compileNodePolicies(options);
}

function getDefaultRouteMode(): RouteContext['mode'] {
  if (typeof window !== 'undefined') {
    return 'spa';
  }

  return 'ssr';
}

function createRenderDataAwareHandler(
  handler: RouteHandler,
  data: unknown
): RouteHandler {
  return (params, context) => {
    const renderContext = getRenderContext();
    if (renderContext) {
      renderContext.renderData = (data ?? null) as Record<
        string,
        unknown
      > | null;
    }

    return handler(params, context);
  };
}

function buildRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  mode: RouteContext['mode']
): RouteRequestResult | Promise<RouteRequestResult> {
  const renderHandler = getRenderHandler(record);
  const loader = mode === 'ssr' ? record.options?.loader : undefined;
  if (loader) {
    const loaded = loader({ params });
    const finalize = (data: unknown): RouteRenderResult => ({
      kind: 'render',
      handler: createRenderDataAwareHandler(renderHandler, data),
      params,
    });

    if (isPromiseLike(loaded)) {
      return Promise.resolve(loaded).then((data) => finalize(data));
    }

    return finalize(loaded);
  }

  return {
    kind: 'render',
    handler: renderHandler,
    params,
  };
}

function continueRoutePolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  startIndex = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = startIndex; index < policies.length; index += 1) {
    const policyResult = policies[index](context);

    if (isPromiseLike(policyResult)) {
      return Promise.resolve(policyResult).then((next) => {
        if (next.kind !== 'allow') {
          return next;
        }

        return continueRoutePolicies(
          policies,
          context,
          record,
          params,
          index + 1
        );
      });
    }

    if (policyResult.kind !== 'allow') {
      return policyResult;
    }
  }

  return buildRenderResult(record, params, context.mode);
}

export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions = {}
): RouteRequestResult | Promise<RouteRequestResult> {
  const routeRecords = options.manifest?.records ?? records;
  const match = getMatchingRecord(target, routeRecords);

  if (!match) {
    return null;
  }

  const { record, params } = match;
  const policies = getRoutePolicies(record.options);
  const mode = options.mode ?? getDefaultRouteMode();

  if (policies.length === 0) {
    return buildRenderResult(record, params, mode);
  }

  const signal =
    options.signal ??
    getRenderContext()?.signal ??
    new AbortController().signal;
  const auth = getActiveRouteAuthOptions(
    options.auth ?? options.manifest?.auth
  );
  const baseContext = buildRouteContextBase(target, params, {
    mode,
    signal,
  });

  const finalize = (authState: { session: unknown; user: unknown }) =>
    continueRoutePolicies(
      policies,
      buildRouteContext(target, params, {
        mode,
        signal,
        auth,
        session: authState.session,
        user: authState.user,
      }),
      record,
      params
    );

  if (!auth?.resolve) {
    return finalize({ session: null, user: null });
  }

  const authState = auth.resolve(baseContext);
  if (isPromiseLike(authState)) {
    return Promise.resolve(authState).then((next) => finalize(next));
  }

  return finalize(authState);
}

/**
 * Resolve a path against an explicit route list (e.g. an SSR per-render
 * context).  When called with the global `routes` array this delegates to
 * the faster `resolveRoute` which uses pre-sorted `records[]`.
 *
 * For externally supplied lists the function:
 *   1. Builds a rank-sorted copy of the list on first call and caches it
 *      in a WeakMap so subsequent resolutions against the same list pay
 *      zero sort cost.
 *   2. Uses pre-parsed `ParsedSegment[]` from a WeakMap cache so no string
 *      splitting or segment parsing occurs on the hot path.
 *   3. Uses a running-best with an early-exit once the sorted list reaches
 *      a rank that cannot beat the current best match.
 */
export function resolveRouteFromRoutes(
  pathname: string,
  routeList: readonly Route[]
): ResolvedRoute | null {
  if (routeList === routes) return resolveRoute(pathname);

  const match = findBestResolvedRouteFromRoutes(pathname, routeList);
  return match ? { handler: match.route.handler, params: match.params } : null;
}
