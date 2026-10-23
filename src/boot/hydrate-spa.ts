/**
 * App bootstrap and mount
 */
import { isProductionEnvironment } from '../common/env';
import type { ResolvedRoute } from '../common/router';
import {
  configureNavigationFocus,
  configureScrollRestoration,
} from '../router/navigate';
import {
  _applyManifest,
  _setActiveRouteAuthOptions,
  lockRouteRegistration,
  setServerLocation,
} from '../router/route';
import { clearRouteState } from '../router/store';
import { publishResolvedAuth } from '../router/resolution';
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
  cleanupApp,
  getAppRoot,
} from './root-lifecycle';
import {
  bindDeniedRouteHandler,
  bindDeniedStatus,
  bindResolvedRouteHandler,
  reconcileInitialRouteMetadata,
  resolveInitialRoute,
} from './route-startup';
import type { HydrateSPAConfig } from './types';
import {
  formatHydrationMismatch,
  type HydrationMismatchInfo,
} from '../common/dom-path';
import type { HydrationOptions } from '../core/dom/hydration';
import { hydrateDataRuntime } from '../data/query-registry';
import { getDefaultDataRuntime } from '../data/data-runtime';
import { resolveRootElement } from './root-element';
import { validateCspNonce } from '../csp-nonce';
import { beginHydrationInteractionReplay } from './hydration-interaction-replay';
import {
  sessionDataRuntime,
  releaseSessionDataRuntime,
  beginSessionAuthBoot,
  detachSessionAuthRoot,
} from './session-auth-runtime';
import { getSessionAuthState } from '../router/session-auth-state';
import { createSPA } from './spa';
import { readHydratedLayoutData } from '../router/route-hydration';

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
  const routeAuth = config.auth ?? manifest.auth;
  const dataRuntime =
    sessionDataRuntime(routeAuth, config.dataRuntime) ??
    getDefaultDataRuntime();
  const boot = beginSessionAuthBoot(routeAuth, dataRuntime, () => {
    if (!getAppRoot(rootElement)) rootElement.replaceChildren();
  });
  let restart = false;
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
    // The auth snapshot is consumed by route resolution below; components
    // never see it through render data.
    const hydrationRenderDataForApp = withoutHydratedAuth(hydrationRenderData);

    configureScrollRestoration(config.scrollRestoration);
    configureNavigationFocus(config.focus, rootElement);

    clearRouteState();
    _applyManifest(manifest);
    // The server already enforced auth for this page. Its opted-in identity
    // snapshot decides the initial route; without a client `resolve` it also
    // stays the identity for navigations.
    const hydratedAuth = readHydratedAuth(hydrationRenderData);
    const sessionState = getSessionAuthState(routeAuth);
    if (sessionState && (!hydratedAuth || !sessionState.adopt(hydratedAuth))) {
      // A missing snapshot does not own the SSR data, and a later live identity
      // may have won before old HTML was adopted. Rebuild against current auth.
      interactionReplay.abort();
      releaseSessionDataRuntime(dataRuntime);
      if (getAppRoot(rootElement)) cleanupApp(rootElement);
      rootElement.replaceChildren();
      await createSPA(config);
      return;
    }
    if (hydrationQueryCache)
      hydrateDataRuntime(dataRuntime, hydrationQueryCache);
    const appRouteSource = {
      registry: config.registry,
      auth: routeAuth,
      runtime: createAppRenderRuntime({
        hydrationResources: hydrationRenderDataForApp?.resources,
        framework: hydrationRenderDataForApp?.framework,
        route: hydrationRenderData?.route,
        hasRoute: hydrationRenderData !== null,
        dataRuntime,
        routeRegistry: config.registry,
        routeAuth,
      }),
    };
    _setActiveRouteAuthOptions(routeAuth);

    const initialRoute = await boot.wait(
      resolveInitialRoute(routeAuth, {
        registry: config.registry,
        load: false,
        authContext: hydratedAuth,
        dataRuntime,
        assertCurrent: boot.assertCurrent,
        signal: boot.signal,
      })
    );
    // A redirect left the origin; the browser is loading that document.
    if (!initialRoute) {
      interactionReplay.abort();
      releaseSessionDataRuntime(dataRuntime);
      return;
    }
    const { path, href: currentUrl, resolved } = initialRoute;
    if (resolved?.kind === 'render') {
      appRouteSource.runtime.layoutData = readHydratedLayoutData(
        resolved.record,
        hydrationRenderData?.framework
      );
    }
    if (isProductionEnvironment()) lockRouteRegistration();

    if (!resolved) {
      throw new Error(`hydrateSPA: no route found for current path (${path}).`);
    }

    await boot.wait(
      reconcileInitialRouteMetadata(resolved, boot.assertCurrent)
    );
    boot.assertCurrent();
    publishResolvedAuth(resolved);
    boot.assertCurrent();
    setServerLocation(currentUrl);

    const hydrationResolved: ResolvedRoute =
      resolved.kind === 'deny'
        ? { handler: bindDeniedRouteHandler(resolved), params: {} }
        : resolved;
    let verifyClientMarkup: (() => Promise<void>) | undefined;
    // What the hydration commit itself rendered, before post-commit work runs.
    let clientMarkup: string | null = null;
    let serializeClientMarkup: ((root: Element) => string) | undefined;
    const captureClientMarkup = () => {
      if (verifyClientMarkup && serializeClientMarkup) {
        clientMarkup = serializeClientMarkup(rootElement);
      }
    };

    const verifying = shouldVerifyHydrationMarkup(config);
    // Verify mode compares markup and reports there; otherwise the cursor
    // reports the nodes it could not adopt.
    const hydrationOptions: HydrationOptions = {
      strict: verifying,
      onMismatch: verifying ? undefined : config.hydrate?.onMismatch,
      reported: new WeakSet(),
    };
    const failOnMismatch = (info: HydrationMismatchInfo, reason: string) => {
      if (config.hydrate?.onMismatch?.(info) === 'continue') return;
      throw new Error(formatHydrationMismatch(info, reason));
    };

    const mountHydratedRoot: typeof mountOrUpdate = (...args) => {
      boot.assertCurrent();
      return mountOrUpdate(args[0], args[1], {
        ...args[2],
        cspNonce: config.cspNonce,
        hydrate: true,
        hydrateOptions: hydrationOptions,
        onCommit: captureClientMarkup,
      });
    };

    if (verifying) {
      const {
        captureServerHydrationMarkup,
        diffClientHydrationMarkup,
        checkHydrationSyncForUrl,
        serializeHydrationMarkup,
      } = await boot.wait(import('../ssr/verify-hydration'));
      serializeClientMarkup = serializeHydrationMarkup;
      boot.assertCurrent();
      const serverMismatch = checkHydrationSyncForUrl({
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
      });
      if (serverMismatch) {
        failOnMismatch(
          serverMismatch,
          'Server HTML does not match expected server-render output.'
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
          // A renderer divergence differs from the server markup both when the
          // hydration commit finishes and after the work it scheduled (error
          // boundary fallbacks, portal retirement) settles. Matching at either
          // point accepts application updates made after the commit, such as
          // a ref adopting a persisted preference.
          const atCommit =
            clientMarkup !== null
              ? diffClientHydrationMarkup(clientMarkup, serverMarkup)
              : undefined;
          if (atCommit === null) return;
          const settled = diffClientHydrationMarkup(
            serializeHydrationMarkup(rootElement),
            serverMarkup
          );
          if (settled) {
            failOnMismatch(
              atCommit ?? settled,
              'Server and client markup differ.'
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
          await boot.wait(
            applySelectiveHydration(
              rootElement,
              hydrationResolved,
              path,
              config.cleanupStrict,
              hydrateOptions,
              appRouteSource,
              {
                mountOrUpdate: mountHydratedRoot,
                registerAppNavigation: (...args) => {
                  boot.assertCurrent();
                  return registerAppNavigation(...args);
                },
                registerRootCleanupCallback,
                activateHydrationBoundary,
              },
              interactionReplay
            )
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
        boot.assertCurrent();
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
          ? bindDeniedStatus(resolved)
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
    boot.assertCurrent();
    interactionReplay.complete();
    boot.assertCurrent();
    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
  } catch (error) {
    interactionReplay.abort();
    const failures: unknown[] = [error];
    const failedApp = getAppRoot(rootElement);
    if (getSessionAuthState(routeAuth) && !failedApp) {
      // A rejected provider snapshot never owns the existing SSR subtree.
      // It can fail before mounting, so no app cleanup owns this markup yet.
      try {
        rootElement.replaceChildren();
      } catch (cleanup) {
        failures.push(cleanup);
      }
    }
    if (
      getSessionAuthState(routeAuth) &&
      failedApp?.appRuntime?.dataRuntime === dataRuntime
    ) {
      try {
        cleanupApp(rootElement);
      } catch (cleanup) {
        failures.push(cleanup);
      }
      try {
        detachSessionAuthRoot(failedApp);
      } catch (cleanup) {
        failures.push(cleanup);
      }
    }
    try {
      releaseSessionDataRuntime(dataRuntime);
    } catch (cleanup) {
      failures.push(cleanup);
    }
    if (failures.length > 1)
      throw new AggregateError(failures, '[Askr] Session boot cleanup failed.');
    if (!boot.stale()) throw error;
    restart = boot.restart();
  } finally {
    boot.detach();
  }
  if (restart) await createSPA(config);
}
