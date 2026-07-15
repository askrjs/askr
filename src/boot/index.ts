/**
 * App bootstrap and mount
 */

import { isProductionEnvironment } from '../common/env';
import type { ResolvedRoute } from '../common/router';
import { configureScrollRestoration } from '../router/navigate';
import {
  _applyManifest,
  _drainLazy,
  _setActiveRouteAuthOptions,
  _snapshotRouteSourceLazy,
  _snapshotLazy,
  clearRoutes,
  hasRegisteredRoutes,
  lockRouteRegistration,
  route as registerRoute,
  setServerLocation,
} from '../router/route';
import { assertExecutionModel } from '../runtime';
import { getRouteRenderData, hasRouteRenderData } from '../router/resolution';
import { createAppRenderRuntime } from '../common/app-render-runtime';
import {
  startHydrationRenderPhase,
  stopHydrationRenderPhase,
} from '../common/render-context';
import {
  applySelectiveHydration,
  applyDeferredStreamPatches,
  markSkippedElements,
  shouldVerifyHydrationMarkup,
  takeHydrationRenderData,
} from './hydration';
import {
  activateHydrationBoundary,
  mountOrUpdate,
  registerAppNavigation,
  registerRootCleanupCallback,
} from './root-lifecycle';
import {
  bindDeniedRouteHandler,
  bindDeniedStatus,
  bindResolvedRouteHandler,
  reconcileInitialRouteMetadata,
  resolveInitialRoute,
} from './route-startup';
import type {
  HydrateSPAConfig,
  IslandConfig,
  IslandsConfig,
  SPAConfig,
} from './types';
import { withIntrinsicHydrationAdoption } from '../renderer';
import { hydrateDataRuntime } from '../data/query-registry';
import { getDefaultDataRuntime } from '../data/data-runtime';
import { resolveRootElement } from './root-element';

export { cleanupApp, hasApp } from './root-lifecycle';
export type {
  HydrateSPAConfig,
  IslandConfig,
  IslandsConfig,
  SPAConfig,
} from './types';

/**
 * createIsland: Enhances existing DOM (no router, mounts once)
 */
export function createIsland(config: IslandConfig): void {
  assertExecutionModel('islands');
  if (!config || typeof config !== 'object') {
    throw new Error('createIsland requires a config object');
  }
  if (typeof config.component !== 'function') {
    throw new Error('createIsland: component must be a function');
  }

  const rootElement = resolveRootElement(config.root);
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  // Islands must not initialize router or routes
  if ('routes' in config) {
    throw new Error(
      'createIsland does not accept routes; use createSPA for routed apps'
    );
  }

  // Routes are never supported with islands.
  // If routes were registered (even at module load time), fail fast to avoid
  // surprising partial router behavior.
  if (hasRegisteredRoutes()) {
    throw new Error(
      'Routes are not supported with islands. Use createSPA (client) or createSSR (server) instead.'
    );
  }

  mountOrUpdate(rootElement, config.component, {
    cleanupStrict: config.cleanupStrict,
  });
}

/**
 * createIslands: Enhances one or more existing DOM roots (no router).
 * The only public islands constructor.
 */
export function createIslands(config: IslandsConfig): void {
  assertExecutionModel('islands');
  if (!config || typeof config !== 'object') {
    throw new Error('createIslands requires a config object');
  }
  if (!Array.isArray(config.islands) || config.islands.length === 0) {
    throw new Error('createIslands requires a non-empty islands array');
  }
  for (const island of config.islands) {
    createIsland(island);
  }
}

/**
 * createSPA: Initializes router and mounts the app with the provided route manifest or route table.
 *
 * Preferred usage with manifest:
 * ```ts
 * import { getManifest } from '@askrjs/askr/router';
 * await createSPA({ root: '#app', manifest: getManifest() });
 * ```
 *
 * Legacy usage with plain routes array (still supported):
 * ```ts
 * await createSPA({ root: '#app', routes: getRoutes() });
 * ```
 */
export async function createSPA(config: SPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('createSPA requires a config object');
  }

  const manifest = config.manifest ?? config.registry?.manifest;
  const routeTable = config.routes ?? config.registry?.routes;
  const hasManifest = manifest != null && manifest.records.length > 0;
  const hasRoutes = Array.isArray(routeTable) && routeTable.length > 0;

  if (!hasManifest && !hasRoutes) {
    throw new Error(
      'createSPA requires a route manifest or route table. ' +
        'Pass `manifest: getManifest()` or `routes: getRoutes()`. ' +
        'If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement = resolveRootElement(config.root);
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  const pendingLazyAtBoot = [
    ..._snapshotLazy(),
    ..._snapshotRouteSourceLazy({ registry: config.registry, manifest }),
  ];

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    // Preferred path: apply pre-built manifest records directly
    _applyManifest(manifest!);
  } else {
    // Legacy path: register plain Route objects (no layout metadata)
    for (const r of routeTable!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  const routeAuth = config.auth ?? manifest?.auth;
  const activeManifest = hasManifest ? manifest : undefined;
  const appRouteSource = {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
    auth: routeAuth,
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtBoot);

  // Lock registration in production to prevent late registration surprises
  if (isProductionEnvironment()) lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  const { path, resolved } = await resolveInitialRoute(routeAuth, {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
  });
  const appRuntime = createAppRenderRuntime(
    resolved?.kind === 'render' && hasRouteRenderData(resolved)
      ? { route: getRouteRenderData(resolved), hasRoute: true }
      : {}
  );

  if (!resolved) {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
      appRuntime,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
    return;
  }

  if (resolved.kind === 'redirect') {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
      appRuntime,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
    return;
  }

  await reconcileInitialRouteMetadata(resolved);

  mountOrUpdate(
    rootElement,
    resolved.kind === 'deny'
      ? bindDeniedStatus(resolved.status)
      : bindResolvedRouteHandler({
          handler: resolved.handler,
          params: resolved.params,
        }),
    {
      cleanupStrict: config.cleanupStrict,
      appRuntime,
    }
  );

  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
  });
}

/**
 * hydrateSPA: Hydrate server-rendered HTML.
 * Accepts either a `manifest` (preferred) or a legacy `routes` array.
 */
export async function hydrateSPA(config: HydrateSPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('hydrateSPA requires a config object');
  }

  const manifest = config.manifest ?? config.registry?.manifest;
  const routeTable = config.routes ?? config.registry?.routes;
  const hasManifest = manifest != null && manifest.records.length > 0;
  const hasRoutes = Array.isArray(routeTable) && routeTable.length > 0;

  if (!hasManifest && !hasRoutes) {
    throw new Error(
      'hydrateSPA requires a route manifest or route table. ' +
        'Pass `manifest: getManifest()` or `routes: getRoutes()`. ' +
        'If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement = resolveRootElement(config.root);
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);
  applyDeferredStreamPatches(rootElement);
  const hydrationRenderData = takeHydrationRenderData(rootElement);
  const hydrationQueryCache = hydrationRenderData?.resources;
  if (hydrationQueryCache) {
    hydrateDataRuntime(
      config.dataRuntime ?? getDefaultDataRuntime(),
      hydrationQueryCache
    );
  }
  const hydrationRenderDataForApp = hydrationRenderData;

  const pendingLazyAtHydrationBoot = [
    ..._snapshotLazy(),
    ..._snapshotRouteSourceLazy({ registry: config.registry, manifest }),
  ];

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    _applyManifest(manifest!);
  } else {
    for (const r of routeTable!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  const routeAuth = config.auth ?? manifest?.auth;
  const activeManifest = hasManifest ? manifest : undefined;
  const appRouteSource = {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
    auth: routeAuth,
    runtime: createAppRenderRuntime({
      framework: hydrationRenderData?.framework,
      route: hydrationRenderData?.route,
      hasRoute: hydrationRenderData !== null,
    }),
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtHydrationBoot);

  const {
    path,
    href: currentUrl,
    resolved,
  } = await resolveInitialRoute(routeAuth, {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
    load: false,
  });
  setServerLocation(currentUrl);
  if (isProductionEnvironment()) lockRouteRegistration();

  if (!resolved) {
    throw new Error(`hydrateSPA: no route found for current path (${path}).`);
  }

  if (resolved.kind === 'redirect') {
    throw new Error(
      `hydrateSPA: unresolved redirect for current path (${path}).`
    );
  }

  await reconcileInitialRouteMetadata(resolved);

  const hydrationResolvedBase: ResolvedRoute =
    resolved.kind === 'deny'
      ? { handler: bindDeniedRouteHandler(resolved.status), params: {} }
      : { handler: resolved.handler, params: resolved.params };
  const hydrationResolved: ResolvedRoute = hydrationResolvedBase;
  const mountHydratedRoot: typeof mountOrUpdate = (...args) =>
    withIntrinsicHydrationAdoption(() => mountOrUpdate(...args));

  if (shouldVerifyHydrationMarkup(config)) {
    const legacyRouteTable = hasManifest
      ? manifest!.records.map((r) => ({
          ...r,
          path: r.path,
          handler: r.handler,
          namespace: r.options.namespace,
        }))
      : routeTable!;

    const { verifyHydrationSyncForUrl } =
      await import('../ssr/verify-hydration');
    if (
      !verifyHydrationSyncForUrl({
        root: rootElement,
        url: currentUrl,
        routes: legacyRouteTable,
        resolved: hydrationResolved,
        options: {
          data: hydrationRenderDataForApp?.resources,
          dataRuntime: config.dataRuntime ?? getDefaultDataRuntime(),
          envelope: hydrationRenderDataForApp ?? undefined,
        },
      })
    ) {
      throw new Error(
        '[Askr] Hydration mismatch detected. Server HTML does not match expected server-render output.'
      );
    }
  }

  const hydrateOptions = config.hydrate;
  if (hydrateOptions) {
    if (hydrateOptions.deferUntilIdle || hydrateOptions.deferBelowFold) {
      if (hydrationRenderDataForApp) {
        startHydrationRenderPhase(hydrationRenderDataForApp);
      }
      try {
        await applySelectiveHydration(
          rootElement,
          hydrationResolved,
          path,
          config.cleanupStrict,
          hydrateOptions,
          appRouteSource,
          {
            mountOrUpdate: mountHydratedRoot,
            registerAppNavigation,
            registerRootCleanupCallback,
            activateHydrationBoundary,
          }
        );
      } finally {
        if (hydrationRenderDataForApp) {
          stopHydrationRenderPhase();
        }
      }
      return;
    }

    if (hydrateOptions.skipSelectors?.length) {
      markSkippedElements(rootElement, hydrateOptions.skipSelectors);
    }
  }

  if (hydrationRenderDataForApp) {
    startHydrationRenderPhase(hydrationRenderDataForApp);
  }
  try {
    mountHydratedRoot(
      rootElement,
      resolved.kind === 'deny'
        ? bindDeniedStatus(resolved.status)
        : bindResolvedRouteHandler(hydrationResolved),
      {
        cleanupStrict: config.cleanupStrict,
        appRuntime: appRouteSource.runtime,
      }
    );
  } finally {
    if (hydrationRenderDataForApp) {
      stopHydrationRenderPhase();
    }
  }
  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
  });
}
