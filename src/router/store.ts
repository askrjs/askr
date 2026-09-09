import type {
  LayoutScopeRecord,
  PageScopeRecord,
  Route,
  RouteAuthOptions,
  RouteDefinition,
  RoutePolicy,
  RouteMetaSource,
} from '../common/router';
import type { AuthRequirement } from '@askrjs/auth';
import { getActiveRenderContext } from '../common/render-context';
import { getCurrentAppRenderRuntime } from '../runtime';
import type {
  InternalRoute,
  InternalRouteRecord,
  RegistrationScope,
} from './internal-types';

/**
 * One route table: everything `route()`, `page()` and `group()` write to.
 *
 * The registration DSL is a set of bare functions, so it has to write somewhere
 * ambient. Naming that target makes it swappable: building a registry now runs
 * the definition against a table of its own instead of clearing the live one,
 * saving a snapshot, and restoring it afterwards. That dance was reentrant only
 * by accident and would have interleaved badly the moment two registries were
 * built concurrently.
 */
export interface RouteTable {
  readonly routes: InternalRoute[];
  readonly records: InternalRouteRecord[];
  readonly namespaces: Set<string>;
  readonly routesByDepth: Map<number, Route[]>;
  readonly registrationScopeStack: RegistrationScope[];
  registrationLocked: boolean;
  defaultRouteAuthOptions: RouteAuthOptions | undefined;
  activeClientRouteAuthOptions: RouteAuthOptions | undefined;
  defaultRouteBasePath: string;
}

export function createRouteTable(): RouteTable {
  return {
    routes: [],
    records: [],
    namespaces: new Set<string>(),
    routesByDepth: new Map<number, Route[]>(),
    registrationScopeStack: [],
    registrationLocked: false,
    defaultRouteAuthOptions: undefined,
    activeClientRouteAuthOptions: undefined,
    defaultRouteBasePath: '',
  };
}

/** The application's own table, used whenever no other one is active. */
const defaultTable = createRouteTable();
let activeTable: RouteTable = defaultTable;

/** Run `fn` with `table` as the registration target, then restore the previous one. */
export function withRouteTable<T>(table: RouteTable, fn: () => T): T {
  const previous = activeTable;
  activeTable = table;
  try {
    return fn();
  } finally {
    activeTable = previous;
  }
}

function getDepth(path: string): number {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  return normalized === '/' ? 0 : normalized.split('/').filter(Boolean).length;
}

export function getRouteRecords(): readonly InternalRouteRecord[] {
  return activeTable.records;
}

export function isRouteStoreRoutes(routeList: readonly Route[]): boolean {
  return routeList === activeTable.routes;
}

export function insertRecordSorted(record: InternalRouteRecord): void {
  let lo = 0;
  let hi = activeTable.records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (activeTable.records[mid].rank >= record.rank) lo = mid + 1;
    else hi = mid;
  }
  activeTable.records.splice(lo, 0, record);
}

export function addRouteToStores(routeObj: InternalRoute): void {
  activeTable.routes.push(routeObj);

  const depth = getDepth(routeObj.path);
  let depthRoutes = activeTable.routesByDepth.get(depth);
  if (!depthRoutes) {
    depthRoutes = [];
    activeTable.routesByDepth.set(depth, depthRoutes);
  }
  depthRoutes.push(routeObj);

  if (routeObj.namespace) {
    activeTable.namespaces.add(routeObj.namespace);
  }
}

export function getActiveRoutes(): readonly Route[] {
  const renderContext = getActiveRenderContext();
  return (
    renderContext?.routes ??
    getCurrentAppRenderRuntime()?.routeRegistry?.routes ??
    activeTable.routes
  );
}

export function getActiveRouteAuthOptions(
  override?: RouteAuthOptions
): RouteAuthOptions | undefined {
  if (override !== undefined) {
    return override;
  }

  const renderContext = getActiveRenderContext();
  if (renderContext) return renderContext.routeAuth;

  const appRuntime = getCurrentAppRenderRuntime();
  if (appRuntime) return appRuntime.routeAuth;

  return (
    activeTable.activeClientRouteAuthOptions ??
    activeTable.defaultRouteAuthOptions
  );
}

export function _setActiveRouteAuthOptions(
  auth: RouteAuthOptions | undefined
): void {
  activeTable.activeClientRouteAuthOptions = auth;
}

export function getDefaultRouteAuthOptions(): RouteAuthOptions | undefined {
  return activeTable.defaultRouteAuthOptions;
}

export function setDefaultRouteAuthOptions(
  auth: RouteAuthOptions | undefined
): void {
  activeTable.defaultRouteAuthOptions = auth;
}

export function getDefaultRouteBasePath(): string {
  return activeTable.defaultRouteBasePath;
}

export function setDefaultRouteBasePath(basePath: string): void {
  activeTable.defaultRouteBasePath = basePath;
}

export function getActiveRouteBasePath(): string {
  const renderContext = getActiveRenderContext();
  if (renderContext?.basePath !== undefined) {
    return renderContext.basePath;
  }

  const appRegistry = getCurrentAppRenderRuntime()?.routeRegistry;
  if (appRegistry) {
    return appRegistry.manifest.basePath ?? '';
  }

  return activeTable.defaultRouteBasePath;
}

export function getCurrentLayoutChain(): LayoutScopeRecord[] {
  const layoutChain: LayoutScopeRecord[] = [];

  for (const scope of activeTable.registrationScopeStack) {
    if (scope.layout) {
      layoutChain.push({ component: scope.layout });
    }
  }

  return layoutChain;
}

export function getCurrentPageChain(): PageScopeRecord[] {
  const pageChain: PageScopeRecord[] = [];

  for (const scope of activeTable.registrationScopeStack) {
    if (scope.page) {
      pageChain.push({ component: scope.page });
    }
  }

  return pageChain;
}

export function hasActivePageScope(): boolean {
  return activeTable.registrationScopeStack.some((scope) => !!scope.page);
}

export function getCurrentPageScope(): RegistrationScope | null {
  for (
    let index = activeTable.registrationScopeStack.length - 1;
    index >= 0;
    index -= 1
  ) {
    const scope = activeTable.registrationScopeStack[index];
    if (scope.kind === 'page') {
      return scope;
    }
  }

  return null;
}

export function getCurrentScopeKind(): RegistrationScope['kind'] | null {
  return (
    activeTable.registrationScopeStack[
      activeTable.registrationScopeStack.length - 1
    ]?.kind ?? null
  );
}

export function getCurrentPathPrefix(): string {
  return (
    activeTable.registrationScopeStack[
      activeTable.registrationScopeStack.length - 1
    ]?.pathPrefix ?? ''
  );
}

export function getCurrentInheritedPolicies(): RoutePolicy[] {
  const policies: RoutePolicy[] = [];

  for (const scope of activeTable.registrationScopeStack) {
    if (scope.policies.length > 0) {
      policies.push(...scope.policies);
    }
  }

  return policies;
}

export function getCurrentInheritedAuthRequirements(): AuthRequirement[] {
  return activeTable.registrationScopeStack.flatMap((scope) =>
    scope.auth ? [scope.auth] : []
  );
}

export function getCurrentInheritedMeta(): RouteMetaSource[] {
  return activeTable.registrationScopeStack.flatMap((scope) =>
    scope.meta ? [scope.meta] : []
  );
}

export function pushRegistrationScope(
  scope: RegistrationScope,
  fn: RouteDefinition
): void {
  activeTable.registrationScopeStack.push(scope);
  try {
    fn();
  } finally {
    activeTable.registrationScopeStack.pop();
  }
}

export function lockRouteRegistration(): void {
  activeTable.registrationLocked = true;
}

export function _lockRouteRegistrationForTests(): void {
  activeTable.registrationLocked = true;
}

export function _unlockRouteRegistrationForTests(): void {
  activeTable.registrationLocked = false;
}

export function assertRouteRegistrationUnlocked(): void {
  if (activeTable.registrationLocked) {
    throw new Error(
      'Route registration is locked after app startup. ' +
        'Register routes at module load time before calling createSPA or createSSR.'
    );
  }
}

export function getRouteList(): Route[] {
  return [...activeTable.routes];
}

export function hasRegisteredRoutes(): boolean {
  return activeTable.routes.length > 0 || activeTable.records.length > 0;
}

export function getNamespaceRoutes(namespace: string): Route[] {
  return activeTable.routes.filter((route) => route.namespace === namespace);
}

export function unloadNamespace(namespace: string): number {
  const before = activeTable.routes.length;

  for (let i = activeTable.routes.length - 1; i >= 0; i--) {
    if (activeTable.routes[i].namespace === namespace) {
      const removed = activeTable.routes[i];
      activeTable.routes.splice(i, 1);

      const depth = getDepth(removed.path);
      const depthRoutes = activeTable.routesByDepth.get(depth);
      if (depthRoutes) {
        const idx = depthRoutes.indexOf(removed);
        if (idx >= 0) depthRoutes.splice(idx, 1);
      }
    }
  }

  for (let i = activeTable.records.length - 1; i >= 0; i--) {
    if (activeTable.records[i].options.namespace === namespace) {
      activeTable.records.splice(i, 1);
    }
  }

  activeTable.namespaces.delete(namespace);
  return before - activeTable.routes.length;
}

export function getLoadedNamespaces(): string[] {
  return Array.from(activeTable.namespaces);
}

export function clearRouteState(): void {
  activeTable.routes.length = 0;
  activeTable.records.length = 0;
  activeTable.namespaces.clear();
  activeTable.routesByDepth.clear();
  activeTable.registrationScopeStack.length = 0;
  activeTable.registrationLocked = false;
  activeTable.defaultRouteAuthOptions = undefined;
  activeTable.activeClientRouteAuthOptions = undefined;
  activeTable.defaultRouteBasePath = '';
}
