/**
 * App bootstrap and mount
 */

import { isProductionEnvironment } from '../common/env';
import type { ResolvedRoute } from '../common/router';
import { configureScrollRestoration } from '../router/navigate';
import {
  _applyManifest,
  _setActiveRouteAuthOptions,
  hasRegisteredRoutes,
  lockRouteRegistration,
  setServerLocation,
} from '../router/route';
import { clearRouteState } from '../router/store';
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
import { validateCspNonce } from '../csp-nonce';
import {
  beginHydrationDirectListenerMode,
  endHydrationDirectListenerMode,
} from '../renderer/prop-bindings';
import {
  beginHydrationListenerTransaction,
  commitHydrationListenerTransaction,
  discardHydrationListenerTransaction,
} from '../renderer/hydration-listener-transaction';

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
  validateCspNonce(config.cspNonce);

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
    cspNonce: config.cspNonce,
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
  validateCspNonce(config.cspNonce);
  if (!Array.isArray(config.islands) || config.islands.length === 0) {
    throw new Error('createIslands requires a non-empty islands array');
  }
  for (const island of config.islands) {
    createIsland({
      ...island,
      cspNonce: island.cspNonce ?? config.cspNonce,
    });
  }
}

/**
 * createSPA: Initializes the router and mounts the app with an explicit route registry.
 * ```ts
 * import { createRouteRegistry } from '@askrjs/askr/router';
 * const registry = createRouteRegistry(() => { ... });
 * await createSPA({ root: '#app', registry });
 * ```
 *
 */
export async function createSPA(config: SPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('createSPA requires a config object');
  }
  validateCspNonce(config.cspNonce);

  if (!config.registry) {
    throw new Error('createSPA requires a route registry.');
  }
  const { manifest } = config.registry;
  if (manifest.records.length === 0) {
    throw new Error(
      'createSPA requires a route registry with at least one route. ' +
        'If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement = resolveRootElement(config.root);
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  configureScrollRestoration(config.scrollRestoration);

  clearRouteState();
  _applyManifest(manifest);

  const routeAuth = config.auth ?? manifest.auth;
  const appRouteSource = {
    registry: config.registry,
    auth: routeAuth,
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Lock registration in production to prevent late registration surprises
  if (isProductionEnvironment()) lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  const {
    path,
    href: currentUrl,
    resolved,
  } = await resolveInitialRoute(routeAuth, {
    registry: config.registry,
  });
  setServerLocation(currentUrl);
  const appRuntime = createAppRenderRuntime({
    ...(resolved?.kind === 'render' && hasRouteRenderData(resolved)
      ? {
          route: getRouteRenderData(resolved),
          hasRoute: true,
        }
      : {}),
    dataRuntime: config.dataRuntime ?? getDefaultDataRuntime(),
    routeRegistry: config.registry,
    routeAuth,
  });

  if (!resolved) {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
      appRuntime,
      cspNonce: config.cspNonce,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
      runtime: appRuntime,
    });
    return;
  }

  if (resolved.kind === 'redirect') {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
      appRuntime,
      cspNonce: config.cspNonce,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
      runtime: appRuntime,
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
      cspNonce: config.cspNonce,
    }
  );

  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
    runtime: appRuntime,
  });
}

/**
 * hydrateSPA: Hydrate server-rendered HTML with an explicit route registry.
 */
export async function hydrateSPA(config: HydrateSPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('hydrateSPA requires a config object');
  }
  validateCspNonce(config.cspNonce);

  if (!config.registry) {
    throw new Error('hydrateSPA requires a route registry.');
  }
  const { manifest } = config.registry;
  if (manifest.records.length === 0) {
    throw new Error(
      'hydrateSPA requires a route registry with at least one route. ' +
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

  configureScrollRestoration(config.scrollRestoration);

  clearRouteState();
  _applyManifest(manifest);

  const routeAuth = config.auth ?? manifest.auth;
  const appRouteSource = {
    registry: config.registry,
    auth: routeAuth,
    runtime: createAppRenderRuntime({
      framework: hydrationRenderData?.framework,
      route: hydrationRenderData?.route,
      hasRoute: hydrationRenderData !== null,
      routeRegistry: config.registry,
      routeAuth,
    }),
  };
  _setActiveRouteAuthOptions(routeAuth);

  const {
    path,
    href: currentUrl,
    resolved,
  } = await resolveInitialRoute(routeAuth, {
    registry: config.registry,
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
    withIntrinsicHydrationAdoption(() =>
      mountOrUpdate(args[0], args[1], {
        ...args[2],
        cspNonce: config.cspNonce,
      })
    );

  if (shouldVerifyHydrationMarkup(config)) {
    const { verifyHydrationSyncForUrl } =
      await import('../ssr/verify-hydration');
    if (
      !verifyHydrationSyncForUrl({
        root: rootElement,
        url: currentUrl,
        registry: config.registry,
        resolved: hydrationResolved,
        options: {
          data: hydrationRenderDataForApp?.resources,
          dataRuntime: config.dataRuntime ?? getDefaultDataRuntime(),
          envelope: hydrationRenderDataForApp ?? undefined,
          cspNonce: config.cspNonce,
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
  const listenerTransaction = beginHydrationListenerTransaction();
  beginHydrationDirectListenerMode();
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
    commitHydrationListenerTransaction(listenerTransaction);
  } catch (error) {
    discardHydrationListenerTransaction(listenerTransaction);
    throw error;
  } finally {
    endHydrationDirectListenerMode();
    if (hydrationRenderDataForApp) {
      stopHydrationRenderPhase();
    }
  }
  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
  });
}
