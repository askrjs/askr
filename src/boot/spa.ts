/**
 * App bootstrap and mount
 */
import { isProductionEnvironment } from '../common/env';
import { configureScrollRestoration } from '../router/navigate';
import {
  _applyManifest,
  _setActiveRouteAuthOptions,
  lockRouteRegistration,
  setServerLocation,
} from '../router/route';
import { clearRouteState } from '../router/store';
import { assertExecutionModel } from '../runtime';
import { getRouteRenderData, hasRouteRenderData } from '../router/resolution';
import { createAppRenderRuntime } from '../common/app-render-runtime';
import { mountOrUpdate, registerAppNavigation } from './root-lifecycle';
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
