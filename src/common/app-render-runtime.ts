import type { RouteAuthOptions, RouteRegistry } from './router';

export interface AppRenderRuntime {
  framework: Readonly<Record<string, unknown>>;
  route: unknown;
  hasRoute: boolean;
  dataRuntime?: import('../data/types').DataRuntime;
  routeRegistry?: RouteRegistry;
  routeAuth?: RouteAuthOptions;
  /**
   * Identifies the route lifetime this runtime renders. A navigation that
   * replaces the lifetime (a pathname change) gets a new value, which keys the
   * route leaf so its state and lifecycle start fresh while layouts persist.
   */
  lifetime?: number;
}

const stagedRouteLocations = new WeakMap<AppRenderRuntime, string>();

export function createAppRenderRuntime(
  input: Partial<AppRenderRuntime> = {}
): AppRenderRuntime {
  return {
    framework: Object.freeze({ ...input.framework }),
    route: input.route,
    hasRoute: input.hasRoute ?? false,
    dataRuntime: input.dataRuntime,
    routeRegistry: input.routeRegistry,
    routeAuth: input.routeAuth,
    lifetime: input.lifetime,
  };
}

export function stageAppRenderRouteLocation(
  runtime: AppRenderRuntime,
  href: string
): void {
  stagedRouteLocations.set(runtime, href);
}

export function getStagedAppRenderRouteLocation(
  runtime: AppRenderRuntime | undefined
): string | undefined {
  return runtime ? stagedRouteLocations.get(runtime) : undefined;
}

export function clearStagedAppRenderRouteLocation(
  runtime: AppRenderRuntime | undefined
): void {
  if (runtime) stagedRouteLocations.delete(runtime);
}
