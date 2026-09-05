import type { ComponentFunction } from './component';

/** Router decisions supplied to boot without exposing an execution record. */
export interface RootUpdateInput {
  handler: ComponentFunction;
  href: string;
  routeData: unknown;
  hasRouteData: boolean;
  replaceLifetime: boolean;
}

export interface PreparedRootUpdate {
  apply(): void;
  publish(): void;
  rollback(): unknown[];
  retire(): unknown[];
}

export interface RootUpdateHost {
  prepare(root: object, input: RootUpdateInput): PreparedRootUpdate;
}

let rootUpdateHost: RootUpdateHost | undefined;

export function configureRootUpdateHost(host: RootUpdateHost): void {
  rootUpdateHost = host;
}

export function prepareRootUpdate(
  root: object,
  input: RootUpdateInput
): PreparedRootUpdate {
  if (!rootUpdateHost)
    throw new Error('[Askr] Root update host is not configured.');
  return rootUpdateHost.prepare(root, input);
}
