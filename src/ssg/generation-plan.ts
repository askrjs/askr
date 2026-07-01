/**
 * SSG incremental generation planning.
 */

import type {
  RouteConfig,
  RouteRenderReason,
  RouteRenderResult,
  SSGMode,
} from './types';
import type {
  IncrementalManifest,
  IncrementalManifestRouteEntry,
} from './incremental-manifest';
import type { ResolvedRouteDescriptor } from './route-utils';

export interface SelectedRoute {
  descriptor: ResolvedRouteDescriptor;
  reason: RouteRenderReason;
  previous: IncrementalManifestRouteEntry | null;
}

export function dedupeStrings(values?: string[]): string[] {
  return values ? Array.from(new Set(values)) : [];
}

export function getRoutesToRender(selected: SelectedRoute[]): RouteConfig[] {
  const routes: RouteConfig[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    routes.push(selected[index].descriptor.route);
  }
  return routes;
}

export function selectRouteForGeneration(
  descriptor: ResolvedRouteDescriptor,
  previous: IncrementalManifestRouteEntry | null,
  mode: SSGMode,
  changedKeys: string[],
  changedRoutes: string[]
): SelectedRoute {
  if (mode === 'full') {
    return { descriptor, reason: 'full', previous };
  }

  if (!previous) {
    return { descriptor, reason: 'new-route', previous };
  }

  if (previous.lastStatus === 'error' || previous.htmlHash === null) {
    return { descriptor, reason: 'new-route', previous };
  }

  if (descriptor.invalidationKeys.length === 0) {
    return { descriptor, reason: 'no-keys', previous };
  }

  if (changedRoutes.includes(descriptor.path)) {
    return { descriptor, reason: 'changed-route', previous };
  }

  if (descriptor.invalidationKeys.some((key) => changedKeys.includes(key))) {
    return { descriptor, reason: 'changed-key', previous };
  }

  return { descriptor, reason: 'unchanged', previous };
}

export function collectRemovedRouteResults(
  manifest: IncrementalManifest | null,
  currentRouteIds: Set<string>
): RouteRenderResult[] {
  if (!manifest) {
    return [];
  }

  const results: RouteRenderResult[] = [];
  for (let index = 0; index < manifest.routes.length; index += 1) {
    const entry = manifest.routes[index];
    if (currentRouteIds.has(entry.routeId)) {
      continue;
    }
    results.push({
      path: entry.path,
      filePath: entry.filePath,
      html: '',
      fileSize: 0,
      renderDuration: 0,
      resourceCount: 0,
      status: 'removed' as const,
      reason: 'deleted' as const,
      written: false,
    });
  }

  return results;
}
