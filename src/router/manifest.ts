import type {
  RouteRegistryOptions,
  RouteManifest,
  RouteRegistry,
  RouteDefinition,
} from '../common/router';
import {
  addRouteToStores,
  clearRouteState,
  getDefaultRouteAuthOptions,
  getRouteRecords,
  getRouteList,
  insertRecordSorted,
  restoreRouteState,
  setDefaultRouteAuthOptions,
  getDefaultRouteBasePath,
  setDefaultRouteBasePath,
  snapshotRouteState,
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
  const previous = snapshotRouteState();
  clearRouteState();

  try {
    setDefaultRouteAuthOptions(options.auth);
    setDefaultRouteBasePath(normalizeRouteBasePath(options.basePath));
    definition();
    const manifest = createRouteManifest();
    const registry = Object.freeze({
      manifest,
      routes: getRouteList(),
    }) as unknown as RouteRegistry;
    return registry;
  } finally {
    restoreRouteState(previous);
  }
}
