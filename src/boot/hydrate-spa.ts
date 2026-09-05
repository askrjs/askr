/**
 * App bootstrap and mount
 */
import { isProductionEnvironment } from '../common/env';
import type { ResolvedRoute } from '../common/router';
import { configureScrollRestoration } from '../router/navigate';
import {
  _applyManifest,
  _setActiveRouteAuthOptions,
  lockRouteRegistration,
  setServerLocation,
} from '../router/route';
import { clearRouteState } from '../router/store';
import { assertExecutionModel } from '../runtime';
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
import type { HydrateSPAConfig } from './types';
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
import { beginHydrationInteractionReplay } from './hydration-interaction-replay';

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
  const interactionReplay = beginHydrationInteractionReplay(
    rootElement,
    (boundary) => activateHydrationBoundary(rootElement, boundary),
    config.hydrate?.skipSelectors
  );
  try {
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

    const hydrationResolved: ResolvedRoute =
      resolved.kind === 'deny'
        ? { handler: bindDeniedRouteHandler(resolved.status), params: {} }
        : resolved;
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
            },
            interactionReplay
          );
        } finally {
          if (hydrationRenderDataForApp) {
            stopHydrationRenderPhase();
          }
        }
        interactionReplay.complete();
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
      interactionReplay.complete();
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
  } catch (error) {
    interactionReplay.abort();
    throw error;
  }
}
