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
import { readHydratedAuth, withoutHydratedAuth } from '../router/auth';
import { assertExecutionModel } from '../common/execution-model';
import { flushSync as flushRuntimeScheduler } from '../core/reactive/scheduler';
import { createAppRenderRuntime } from '../common/app-render-runtime';
import {
  startHydrationRenderPhase,
  stopHydrationRenderPhase,
} from '../common/render-context';
import {
  applySelectiveHydration,
  adoptSsrStyleCarriers,
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
import { hydrateDataRuntime } from '../data/query-registry';
import { getDefaultDataRuntime } from '../data/data-runtime';
import { resolveRootElement } from './root-element';
import { validateCspNonce } from '../csp-nonce';
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
    adoptSsrStyleCarriers(rootElement);
    const hydrationRenderData = takeHydrationRenderData(rootElement);
    const hydrationQueryCache = hydrationRenderData?.queries;
    const dataRuntime = config.dataRuntime ?? getDefaultDataRuntime();
    if (hydrationQueryCache) {
      hydrateDataRuntime(dataRuntime, hydrationQueryCache);
    }
    // The auth snapshot is consumed by route resolution below; components
    // never see it through render data.
    const hydrationRenderDataForApp = withoutHydratedAuth(hydrationRenderData);

    configureScrollRestoration(config.scrollRestoration);

    clearRouteState();
    _applyManifest(manifest);
    // The server already enforced auth for this page. Its opted-in identity
    // snapshot decides the initial route; without a client `resolve` it also
    // stays the identity for navigations.
    const hydratedAuth = readHydratedAuth(hydrationRenderData);

    const routeAuth = config.auth ?? manifest.auth;
    const appRouteSource = {
      registry: config.registry,
      auth: routeAuth,
      runtime: createAppRenderRuntime({
        framework: hydrationRenderDataForApp?.framework,
        route: hydrationRenderData?.route,
        hasRoute: hydrationRenderData !== null,
        dataRuntime,
        routeRegistry: config.registry,
        routeAuth,
      }),
    };
    _setActiveRouteAuthOptions(routeAuth);

    const initialRoute = await resolveInitialRoute(routeAuth, {
      registry: config.registry,
      load: false,
      authContext: hydratedAuth,
      dataRuntime,
    });
    // A redirect left the origin; the browser is loading that document.
    if (!initialRoute) {
      interactionReplay.abort();
      return;
    }
    const { path, href: currentUrl, resolved } = initialRoute;
    setServerLocation(currentUrl);
    if (isProductionEnvironment()) lockRouteRegistration();

    if (!resolved) {
      throw new Error(`hydrateSPA: no route found for current path (${path}).`);
    }

    await reconcileInitialRouteMetadata(resolved);

    const hydrationResolved: ResolvedRoute =
      resolved.kind === 'deny'
        ? { handler: bindDeniedRouteHandler(resolved.status), params: {} }
        : resolved;
    const mountHydratedRoot: typeof mountOrUpdate = (...args) =>
      mountOrUpdate(args[0], args[1], {
        ...args[2],
        cspNonce: config.cspNonce,
        hydrate: true,
      });

    let verifyClientMarkup: (() => Promise<void>) | undefined;
    if (shouldVerifyHydrationMarkup(config)) {
      const {
        captureServerHydrationMarkup,
        verifyClientHydrationMarkup,
        verifyHydrationSyncForUrl,
      } = await import('../ssr/verify-hydration');
      if (
        !verifyHydrationSyncForUrl({
          root: rootElement,
          url: currentUrl,
          registry: config.registry,
          resolved: hydrationResolved,
          options: {
            data: hydrationRenderDataForApp?.resources,
            dataRuntime,
            envelope: hydrationRenderDataForApp ?? undefined,
            cspNonce: config.cspNonce,
          },
        })
      ) {
        throw new Error(
          '[Askr] Hydration mismatch detected. Server HTML does not match expected server-render output.'
        );
      }
      // The server render above cannot see differences between the SSR
      // serializer and the DOM renderer, so also compare the server markup
      // with what the client renderer leaves after hydrating it.
      const serverMarkup = captureServerHydrationMarkup(
        rootElement,
        currentUrl,
        hydrationRenderDataForApp ?? undefined
      );
      if (serverMarkup !== null) {
        verifyClientMarkup = async () => {
          // Let the work the hydration commit scheduled settle first.
          await Promise.resolve();
          if (!verifyClientHydrationMarkup(rootElement, serverMarkup)) {
            throw new Error(
              '[Askr] Hydration mismatch detected between server and client markup.'
            );
          }
        };
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
        flushRuntimeScheduler();
        if (!rootElement.querySelector('[data-skip-hydrate]')) {
          await verifyClientMarkup?.();
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
      flushRuntimeScheduler();
    } finally {
      if (hydrationRenderDataForApp) {
        stopHydrationRenderPhase();
      }
    }
    await verifyClientMarkup?.();
    interactionReplay.complete();
    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
  } catch (error) {
    interactionReplay.abort();
    throw error;
  }
}
