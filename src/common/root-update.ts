import type { ComponentFunction } from './component';
import type { AppRenderRouteState } from './app-render-runtime';

/** Router decisions supplied to boot without exposing an execution record. */
export interface RootUpdateInput {
  handler: ComponentFunction;
  href: string;
  locationState?: AppRenderRouteState;
  routeData: unknown;
  hasRouteData: boolean;
  replaceLifetime: boolean;
}

/** Outcome of publishing a prepared root update. */
export interface RootPublishResult {
  /**
   * The commit was undone by a failed DOM write: the root still shows its
   * previous content and its app state was restored.
   */
  aborted: boolean;
  /** Failures from the commit, whether or not it was undone. */
  errors: unknown[];
}

export interface PreparedRootUpdate {
  apply(): void;
  publish(): RootPublishResult;
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
