import type {
  RouteRegistryOptions,
  RouteManifest,
  RouteRegistry,
  RouteDefinition,
} from '../common/router';
import {
  addRouteToStores,
  createRouteTable,
  getDefaultRouteAuthOptions,
  getRouteRecords,
  getRouteList,
  insertRecordSorted,
  setDefaultRouteAuthOptions,
  getDefaultRouteBasePath,
  setDefaultRouteBasePath,
  withRouteTable,
} from './store';
import type { InternalRouteRecord } from './internal-types';
import { normalizeRouteBasePath } from './base-path';

function createRouteManifest(): RouteManifest {
  const auth = getDefaultRouteAuthOptions();
  return {
    records: [...getRouteRecords()],
    ...(auth ? { auth } : {}),
    ...(getDefaultRouteBasePath()
      ? { basePath: getDefaultRouteBasePath() }
      : {}),
  };
}

export function _applyManifest(manifest: RouteManifest): void {
  setDefaultRouteAuthOptions(manifest.auth);
  setDefaultRouteBasePath(normalizeRouteBasePath(manifest.basePath));
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

/**
 * Run `definition` to declare routes (via `route`/`page`/`group`/`fallback`)
 * and build a {@link RouteRegistry} to pass to `createSPA`/`hydrateSPA`.
 */
export function createRouteRegistry(
  definition: RouteDefinition,
  options: RouteRegistryOptions = {}
): RouteRegistry {
  // Built against a table of its own, so declaring a registry never disturbs
  // the application's routes and two registries can be built independently.
  return withRouteTable(createRouteTable(), () => {
    setDefaultRouteAuthOptions(options.auth);
    setDefaultRouteBasePath(normalizeRouteBasePath(options.basePath));
    definition();
    return Object.freeze({
      manifest: createRouteManifest(),
      routes: getRouteList(),
    }) as unknown as RouteRegistry;
  });
}
