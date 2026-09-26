/**
 * Route updates for application roots.
 *
 * `apply()` renders the destination (render phase only); `publish()` commits
 * it; `rollback()` discards it and restores the root's previous route state.
 * A navigation applies every root first and publishes only if all succeeded.
 */

import {
  clearStagedAppRenderRouteLocation,
  createAppRenderRuntime,
  stageAppRenderRouteLocation,
} from '../common/app-render-runtime';
import {
  configureRootUpdateHost,
  type PreparedRootUpdate,
  type RootUpdateInput,
} from '../common/root-update';
import type { PreparedRender } from '../core/dom/root';
import { withoutRouteHydrationMetadata } from '../router/route-hydration';
import type { AppRoot } from './root-lifecycle';
import { wrapRootRouteHandler } from './root-handler';

function prepare(root: object, input: RootUpdateInput): PreparedRootUpdate {
  const app = root as AppRoot;
  const current = app.appRuntime;
  const runtime = createAppRenderRuntime({
    framework: withoutRouteHydrationMetadata(current?.framework),
    dataRuntime: current?.dataRuntime,
    routeRegistry: current?.routeRegistry,
    routeAuth: current?.routeAuth,
    route: input.routeData,
    hasRoute: input.hasRouteData,
  });
  const previous = {
    appRuntime: app.appRuntime,
    component: app.component,
    handler: app.handler,
    generation: app.generation,
  };
  let prepared: PreparedRender | null = null;
  let settled = false;

  const restore = () => {
    app.appRuntime = previous.appRuntime;
    app.component = previous.component;
    app.handler = previous.handler;
    app.generation = previous.generation;
  };

  return {
    apply() {
      if (prepared || settled) return;
      stageAppRenderRouteLocation(runtime, input.href);
      app.appRuntime = runtime;
      if (input.replaceLifetime) {
        app.component = input.handler;
        app.handler = wrapRootRouteHandler(input.handler, app.cspNonce);
        app.generation++;
      }
      try {
        prepared = app.root.prepare(app.view());
      } catch (error) {
        restore();
        clearStagedAppRenderRouteLocation(runtime);
        throw error;
      }
    },
    publish() {
      if (settled) return;
      settled = true;
      prepared?.commit();
      clearStagedAppRenderRouteLocation(runtime);
    },
    rollback() {
      if (settled) return [];
      settled = true;
      clearStagedAppRenderRouteLocation(runtime);
      const errors = prepared?.discard() ?? [];
      restore();
      return errors;
    },
    retire() {
      return [];
    },
  };
}

export function installRootUpdateHost(): void {
  configureRootUpdateHost({ prepare });
}
