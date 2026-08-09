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

const routes: InternalRoute[] = [];
const records: InternalRouteRecord[] = [];
const namespaces = new Set<string>();
const routesByDepth = new Map<number, Route[]>();

const registrationScopeStack: RegistrationScope[] = [];

let registrationLocked = false;
let defaultRouteAuthOptions: RouteAuthOptions | undefined;
let activeClientRouteAuthOptions: RouteAuthOptions | undefined;
let defaultRouteBasePath = '';

type RouteStateSnapshot = {
  routes: InternalRoute[];
  records: InternalRouteRecord[];
  namespaces: string[];
  registrationLocked: boolean;
  defaultRouteAuthOptions: RouteAuthOptions | undefined;
  activeClientRouteAuthOptions: RouteAuthOptions | undefined;
  defaultRouteBasePath: string;
  routesByDepth: Array<[number, Route[]]>;
  registrationScopeStack: RegistrationScope[];
};

function getDepth(path: string): number {
  const normalized =
    path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  return normalized === '/' ? 0 : normalized.split('/').filter(Boolean).length;
}

export function getRouteRecords(): readonly InternalRouteRecord[] {
  return records;
}

export function isRouteStoreRoutes(routeList: readonly Route[]): boolean {
  return routeList === routes;
}

export function insertRecordSorted(record: InternalRouteRecord): void {
  let lo = 0;
  let hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].rank >= record.rank) lo = mid + 1;
    else hi = mid;
  }
  records.splice(lo, 0, record);
}

export function addRouteToStores(routeObj: InternalRoute): void {
  routes.push(routeObj);

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

export function getActiveRoutes(): readonly Route[] {
  const renderContext = getActiveRenderContext();
  return (
    renderContext?.routes ??
    getCurrentAppRenderRuntime()?.routeRegistry?.routes ??
    routes
  );
}

export function getActiveRouteAuthOptions(
  override?: RouteAuthOptions
): RouteAuthOptions | undefined {
  if (override) {
    return override;
  }

  return (
    getActiveRenderContext()?.routeAuth ??
    activeClientRouteAuthOptions ??
    defaultRouteAuthOptions
  );
}

export function _setActiveRouteAuthOptions(
  auth: RouteAuthOptions | undefined
): void {
  activeClientRouteAuthOptions = auth;
}

export function getDefaultRouteAuthOptions(): RouteAuthOptions | undefined {
  return defaultRouteAuthOptions;
}

export function setDefaultRouteAuthOptions(
  auth: RouteAuthOptions | undefined
): void {
  defaultRouteAuthOptions = auth;
}

export function getDefaultRouteBasePath(): string {
  return defaultRouteBasePath;
}

export function setDefaultRouteBasePath(basePath: string): void {
  defaultRouteBasePath = basePath;
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

  return defaultRouteBasePath;
}

export function getCurrentLayoutChain(): LayoutScopeRecord[] {
  const layoutChain: LayoutScopeRecord[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.layout) {
      layoutChain.push({ component: scope.layout });
    }
  }

  return layoutChain;
}

export function getCurrentPageChain(): PageScopeRecord[] {
  const pageChain: PageScopeRecord[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.page) {
      pageChain.push({ component: scope.page });
    }
  }

  return pageChain;
}

export function hasActivePageScope(): boolean {
  return registrationScopeStack.some((scope) => !!scope.page);
}

export function getCurrentPageScope(): RegistrationScope | null {
  for (let index = registrationScopeStack.length - 1; index >= 0; index -= 1) {
    const scope = registrationScopeStack[index];
    if (scope.kind === 'page') {
      return scope;
    }
  }

  return null;
}

export function getCurrentScopeKind(): RegistrationScope['kind'] | null {
  return (
    registrationScopeStack[registrationScopeStack.length - 1]?.kind ?? null
  );
}

export function getCurrentPathPrefix(): string {
  return (
    registrationScopeStack[registrationScopeStack.length - 1]?.pathPrefix ?? ''
  );
}

export function getCurrentInheritedPolicies(): RoutePolicy[] {
  const policies: RoutePolicy[] = [];

  for (const scope of registrationScopeStack) {
    if (scope.policies.length > 0) {
      policies.push(...scope.policies);
    }
  }

  return policies;
}

export function getCurrentInheritedAuthRequirements(): AuthRequirement[] {
  return registrationScopeStack.flatMap((scope) =>
    scope.auth ? [scope.auth] : []
  );
}

export function getCurrentInheritedMeta(): RouteMetaSource[] {
  return registrationScopeStack.flatMap((scope) =>
    scope.meta ? [scope.meta] : []
  );
}

export function pushRegistrationScope(
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

export function lockRouteRegistration(): void {
  registrationLocked = true;
}

export function _lockRouteRegistrationForTests(): void {
  registrationLocked = true;
}

export function _unlockRouteRegistrationForTests(): void {
  registrationLocked = false;
}

export function assertRouteRegistrationUnlocked(): void {
  if (registrationLocked) {
    throw new Error(
      'Route registration is locked after app startup. ' +
        'Register routes at module load time before calling createSPA or createSSR.'
    );
  }
}

export function getRouteList(): Route[] {
  return [...routes];
}

export function hasRegisteredRoutes(): boolean {
  return routes.length > 0 || records.length > 0;
}

export function getNamespaceRoutes(namespace: string): Route[] {
  return routes.filter((route) => route.namespace === namespace);
}

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

  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].options.namespace === namespace) {
      records.splice(i, 1);
    }
  }

  namespaces.delete(namespace);
  return before - routes.length;
}

export function getLoadedNamespaces(): string[] {
  return Array.from(namespaces);
}

export function clearRouteState(): void {
  routes.length = 0;
  records.length = 0;
  namespaces.clear();
  routesByDepth.clear();
  registrationScopeStack.length = 0;
  registrationLocked = false;
  defaultRouteAuthOptions = undefined;
  activeClientRouteAuthOptions = undefined;
  defaultRouteBasePath = '';
}

export function snapshotRouteState(): RouteStateSnapshot {
  return {
    routes: [...routes],
    records: [...records],
    namespaces: [...namespaces],
    registrationLocked,
    defaultRouteAuthOptions,
    activeClientRouteAuthOptions,
    defaultRouteBasePath,
    routesByDepth: [...routesByDepth.entries()].map(([depth, depthRoutes]) => [
      depth,
      [...depthRoutes],
    ]),
    registrationScopeStack: [...registrationScopeStack],
  };
}

export function restoreRouteState(snapshot: RouteStateSnapshot): void {
  routes.length = 0;
  routes.push(...snapshot.routes);

  records.length = 0;
  records.push(...snapshot.records);

  namespaces.clear();
  for (const namespace of snapshot.namespaces) {
    namespaces.add(namespace);
  }

  routesByDepth.clear();
  for (const [depth, depthRoutes] of snapshot.routesByDepth) {
    routesByDepth.set(depth, [...depthRoutes]);
  }

  registrationScopeStack.length = 0;
  registrationScopeStack.push(...snapshot.registrationScopeStack);

  registrationLocked = snapshot.registrationLocked;
  defaultRouteAuthOptions = snapshot.defaultRouteAuthOptions;
  activeClientRouteAuthOptions = snapshot.activeClientRouteAuthOptions;
  defaultRouteBasePath = snapshot.defaultRouteBasePath;
}
