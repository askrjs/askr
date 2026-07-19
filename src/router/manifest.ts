import type {
  RegisterRoutesOptions,
  RouteManifest,
  RouteRegistry,
  RouteDefinition,
} from '../common/router';
import { registerRoutes } from './authoring';
import {
  addRouteToStores,
  clearRouteState,
  getDefaultRouteAuthOptions,
  getRouteRecords,
  getRoutes,
  insertRecordSorted,
  restoreRouteState,
  setDefaultRouteAuthOptions,
  snapshotRouteState,
} from './store';
import type { InternalRouteRecord } from './internal-types';

export function getManifest(): RouteManifest {
  const auth = getDefaultRouteAuthOptions();
  return {
    records: [...getRouteRecords()],
    ...(auth ? { auth } : {}),
  };
}

export function _applyManifest(manifest: RouteManifest): void {
  setDefaultRouteAuthOptions(manifest.auth);
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

export function clearRoutes(): void {
  clearRouteState();
}

export function createRouteRegistry(
  definition: RouteDefinition,
  options: RegisterRoutesOptions = {}
): RouteRegistry {
  const previous = snapshotRouteState();
  clearRoutes();

  try {
    registerRoutes(definition, options);
    const manifest = getManifest();
    const registry = Object.freeze({
      manifest,
      routes: getRoutes(),
    });
    return registry;
  } finally {
    restoreRouteState(previous);
  }
}
