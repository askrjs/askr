import type { Route, RouteManifest, RouteRegistry } from '../src/common/router';
import { getRouteList, getRouteRecords } from '../src/router/store';
import { resetRouterState } from '../src/router/reset';
import { createRouteRegistry, route } from '../src/router/route';

export function resetRouteState(): void {
  resetRouterState();
}

export function currentRouteManifest(): RouteManifest {
  return { records: [...getRouteRecords()] };
}

export function currentRouteList() {
  return getRouteList();
}

export function currentRouteRegistry(
  manifest: RouteManifest = currentRouteManifest(),
  routes = currentRouteList()
): RouteRegistry {
  return Object.freeze({
    manifest,
    routes:
      routes.length > 0
        ? routes
        : manifest.records.map((record) => ({
            path: record.path,
            handler: record.handler,
            namespace: record.options.namespace,
          })),
  });
}

export function routeRegistryFromTable(
  routes: readonly Pick<Route, 'path' | 'handler' | 'namespace'>[]
): RouteRegistry {
  return createRouteRegistry(() => {
    for (const entry of routes) {
      route(
        entry.path,
        entry.handler,
        entry.namespace ? { namespace: entry.namespace } : undefined
      );
    }
  });
}
