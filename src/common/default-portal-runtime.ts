type DefaultPortalHost = (props?: {
  __askrAutoDefaultPortal?: boolean;
}) => unknown;

interface DefaultPortalRuntime {
  host: DefaultPortalHost;
  clearForInstance(instance: object): void;
  disposeScope(scope: object | null): void;
}

let defaultPortalRuntime: DefaultPortalRuntime | null = null;

function InactiveDefaultPortalHost(): null {
  return null;
}

/** Register the optional portal capability when its public module is loaded. */
export function registerDefaultPortalRuntime(
  runtime: DefaultPortalRuntime
): void {
  defaultPortalRuntime = runtime;
}

export function getDefaultPortalHost(): DefaultPortalHost {
  return defaultPortalRuntime?.host ?? InactiveDefaultPortalHost;
}

export function clearRegisteredDefaultPortalForInstance(
  instance: object
): void {
  defaultPortalRuntime?.clearForInstance(instance);
}

export function disposeRegisteredDefaultPortalScope(
  scope: object | null
): void {
  defaultPortalRuntime?.disposeScope(scope);
}
