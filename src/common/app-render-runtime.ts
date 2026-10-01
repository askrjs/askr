import type { RouteAuthOptions, RouteRegistry } from './router';

export interface AppRenderRuntime {
  /** Resource values retained for deferred hydration work. */
  hydrationResources?: Readonly<Record<string, unknown>>;
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

export interface AppRenderRouteState {
  readonly hasState: boolean;
  readonly state: unknown;
}

const stagedRouteLocations = new WeakMap<
  AppRenderRuntime,
  { href: string; state?: AppRenderRouteState }
>();

export function createAppRenderRuntime(
  input: Partial<AppRenderRuntime> = {}
): AppRenderRuntime {
  return {
    hydrationResources: input.hydrationResources,
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
  href: string,
  state?: AppRenderRouteState
): void {
  stagedRouteLocations.set(runtime, { href, state });
}

export function getStagedAppRenderRouteLocation(
  runtime: AppRenderRuntime | undefined
): string | undefined {
  return runtime ? stagedRouteLocations.get(runtime)?.href : undefined;
}

export function getStagedAppRenderRouteState(
  runtime: AppRenderRuntime | undefined
): AppRenderRouteState | undefined {
  return runtime ? stagedRouteLocations.get(runtime)?.state : undefined;
}

export function clearStagedAppRenderRouteLocation(
  runtime: AppRenderRuntime | undefined
): void {
  if (runtime) stagedRouteLocations.delete(runtime);
}
