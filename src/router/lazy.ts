import type {
  RouteManifest,
  RouteParams,
  RouteRegistry,
  RouteComponent,
} from '../common/router';
import type { AnyRouteComponent } from './internal-types';

const pendingLazy = new Set<Promise<unknown>>();
const registryLazyImports = new WeakMap<RouteRegistry, Promise<unknown>[]>();
const manifestLazyImports = new WeakMap<RouteManifest, Promise<unknown>[]>();

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

export function _snapshotLazy(): Promise<unknown>[] {
  return [...pendingLazy];
}

export function _snapshotRouteSourceLazy(source: {
  registry?: RouteRegistry;
  manifest?: RouteManifest;
}): Promise<unknown>[] {
  const imports = new Set<Promise<unknown>>();

  if (source.registry) {
    for (const lazyImport of registryLazyImports.get(source.registry) ?? []) {
      imports.add(lazyImport);
    }
  }

  const manifest = source.manifest ?? source.registry?.manifest;
  if (manifest) {
    for (const lazyImport of manifestLazyImports.get(manifest) ?? []) {
      imports.add(lazyImport);
    }
  }

  return [...imports];
}

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

export function associateRouteSourceLazy(
  registry: RouteRegistry,
  manifest: RouteManifest,
  lazyImports: Promise<unknown>[]
): void {
  if (lazyImports.length === 0) {
    return;
  }

  registryLazyImports.set(registry, lazyImports);
  manifestLazyImports.set(manifest, lazyImports);
}

export function clearPendingLazy(): void {
  pendingLazy.clear();
}

export function restorePendingLazy(lazyImports: readonly Promise<unknown>[]) {
  pendingLazy.clear();
  for (const lazyImport of lazyImports) {
    pendingLazy.add(lazyImport);
  }
}
