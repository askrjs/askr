/**
 * App bootstrap and mount
 */
import { isProductionEnvironment } from '../common/env';
import { jsx } from '../jsx/jsx-runtime';
import { configureScrollRestoration } from '../router/navigate';
import {
  _applyManifest,
  _setActiveRouteAuthOptions,
  lockRouteRegistration,
  setServerLocation,
} from '../router/route';
import { clearRouteState } from '../router/store';
import { assertExecutionModel } from '../common/execution-model';
import {
  getRouteRenderData,
  hasRouteRenderData,
  publishResolvedAuth,
} from '../router/resolution';
import { createAppRenderRuntime } from '../common/app-render-runtime';
import {
  mountOrUpdate,
  registerAppNavigation,
  cleanupApp,
  getAppRoot,
} from './root-lifecycle';
import {
  bindDeniedStatus,
  bindResolvedRouteHandler,
  reconcileInitialRouteMetadata,
  resolveInitialRoute,
} from './route-startup';
import type { SPAConfig } from './types';
import { getDefaultDataRuntime } from '../data/data-runtime';
import { resolveRootElement } from './root-element';
import { validateCspNonce } from '../csp-nonce';
import {
  sessionDataRuntime,
  releaseSessionDataRuntime,
  beginSessionAuthBoot,
  detachSessionAuthRoot,
} from './session-auth-runtime';
import {
  isRouteErrorResult,
  setRootRendersRouteError,
} from '../router/route-error';
import { getSessionAuthState } from '../router/session-auth-state';

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

  const routeAuth = config.auth ?? manifest.auth;
  const dataRuntime =
    sessionDataRuntime(routeAuth, config.dataRuntime) ??
    getDefaultDataRuntime();

  configureScrollRestoration(config.scrollRestoration);

  clearRouteState();
  _applyManifest(manifest);

  const appRouteSource = {
    registry: config.registry,
    auth: routeAuth,
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Lock registration in production to prevent late registration surprises
  if (isProductionEnvironment()) lockRouteRegistration();

  // The initial route owns an epoch before any asynchronous auth/loader work.
  const boot = beginSessionAuthBoot(routeAuth, dataRuntime);
  let restart = false;
  try {
    const initialRoute = await boot.wait(
      resolveInitialRoute(routeAuth, {
        registry: config.registry,
        dataRuntime,
        assertCurrent: boot.assertCurrent,
        signal: boot.signal,
      })
    );
    // A redirect left the origin; the browser is loading that document.
    if (!initialRoute) {
      releaseSessionDataRuntime(dataRuntime);
      return;
    }
    const { path, href: currentUrl, resolved } = initialRoute;
    const appRuntime = createAppRenderRuntime({
      ...(resolved?.kind === 'render' && hasRouteRenderData(resolved)
        ? { route: getRouteRenderData(resolved), hasRoute: true }
        : {}),
      dataRuntime,
      routeRegistry: config.registry,
      routeAuth,
    });
    if (resolved)
      await boot.wait(
        reconcileInitialRouteMetadata(resolved, boot.assertCurrent)
      );
    boot.assertCurrent();
    setServerLocation(currentUrl);
    if (resolved) publishResolvedAuth(resolved);
    mountOrUpdate(
      rootElement,
      !resolved
        ? () => jsx('div', { children: [] })
        : resolved.kind === 'deny'
          ? bindDeniedStatus(resolved)
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
    boot.assertCurrent();
    const mountedApp = getAppRoot(rootElement);
    if (
      mountedApp &&
      resolved?.kind === 'render' &&
      isRouteErrorResult(resolved)
    )
      setRootRendersRouteError(mountedApp, true);
    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
      runtime: appRuntime,
    });
    boot.assertCurrent();
  } catch (error) {
    const failures: unknown[] = [error];
    const failedApp = getAppRoot(rootElement);
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
