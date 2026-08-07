export interface AppRenderRuntime {
  framework: Readonly<Record<string, unknown>>;
  route: unknown;
  hasRoute: boolean;
  dataRuntime?: import('../data/types').DataRuntime;
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
