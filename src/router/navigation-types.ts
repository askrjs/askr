import type {
  RouteMeta,
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import type { AppRegistration } from './navigation-registry';
import type { NavigationScrollBehavior } from './navigation-scroll';
import type { AppRenderRuntime } from '../common/app-render-runtime';

/** Options for {@link navigate}. */
export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
  /** Entry-local browser history state. It is not serialized into the URL or sent to the server. */
  state?: unknown;
};

export type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
};

export type AppNavigationTarget = {
  app: AppRegistration;
  /** Exact app owner at resolution start; replacement invalidates pending targets. */
  runtime: AppRenderRuntime | undefined;
  resolved: RouteRequestResult;
  metadata?: Readonly<RouteMeta>;
};

export function hasCurrentNavigationOwners(
  targets: readonly AppNavigationTarget[]
): boolean {
  return targets.every(
    (target) =>
      target.resolved === null ||
      target.app.instance.appRuntime === target.runtime
  );
}

export function isRenderResult(
  result: RouteRequestResult
): result is RouteRenderResult {
  return result !== null && result.kind === 'render';
}
