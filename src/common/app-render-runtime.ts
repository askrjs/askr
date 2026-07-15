export interface AppRenderRuntime {
  framework: Readonly<Record<string, unknown>>;
  route: unknown;
  hasRoute: boolean;
}

export function createAppRenderRuntime(
  input: Partial<AppRenderRuntime> = {}
): AppRenderRuntime {
  return {
    framework: Object.freeze({ ...input.framework }),
    route: input.route,
    hasRoute: input.hasRoute ?? false,
  };
}
