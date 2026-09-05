import {
  configureRootUpdateHost,
  type PreparedRootUpdate,
  type RootUpdateInput,
} from '../common/root-update';
import { clearRegisteredDefaultPortalForInstance } from '../common/default-portal-runtime';
import {
  clearStagedAppRenderRouteLocation,
  createAppRenderRuntime,
  stageAppRenderRouteLocation,
} from '../common/app-render-runtime';
import { captureComponentGeneration } from '../runtime/component-generation';
import { executeComponent, type ComponentInstance } from '../runtime';
import { captureRootHost } from '../renderer/root-host-snapshot';
import { withoutRouteHydrationMetadata } from '../router/route-hydration';
import { wrapRootRouteHandler } from './root-handler';

function prepare(root: object, input: RootUpdateInput): PreparedRootUpdate {
  const instance = root as ComponentInstance;
  const generation = captureComponentGeneration(instance);
  const host = captureRootHost(instance.target);
  const current = instance._appRenderRuntime;
  const runtime = createAppRenderRuntime({
    framework: withoutRouteHydrationMetadata(current?.framework),
    dataRuntime: current?.dataRuntime,
    routeRegistry: current?.routeRegistry,
    routeAuth: current?.routeAuth,
    route: input.routeData,
    hasRoute: input.hasRouteData,
  });
  let applied = false;
  let settled = false;
  return {
    apply() {
      if (applied) return;
      applied = true;
      stageAppRenderRouteLocation(runtime, input.href);
      instance._appRenderRuntime = runtime;
      if (input.replaceLifetime) {
        clearRegisteredDefaultPortalForInstance(instance);
        generation.prepare(
          wrapRootRouteHandler(input.handler, instance._cspNonce),
          {}
        );
        executeComponent(instance);
      } else instance._enqueueRun?.();
    },
    publish() {
      clearStagedAppRenderRouteLocation(runtime);
    },
    rollback() {
      if (settled) return [];
      settled = true;
      clearStagedAppRenderRouteLocation(runtime);
      return applied ? generation.rollback(() => host.restore()) : [];
    },
    retire() {
      if (settled) return [];
      settled = true;
      const errors: unknown[] = [];
      if (applied && input.replaceLifetime) {
        try {
          generation.retire();
        } catch (error) {
          errors.push(error);
        }
      }
      return errors;
    },
  };
}

export function installRootUpdateHost(): void {
  configureRootUpdateHost({ prepare });
}
