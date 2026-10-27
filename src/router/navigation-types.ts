import type {
  RouteMeta,
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import type { AppRegistration } from './navigation-registry';
import { isCurrentAppRegistration } from './navigation-registry';
import type { NavigationScrollBehavior } from './navigation-scroll';
import type { AppRenderRuntime } from '../common/app-render-runtime';

/** Options for {@link navigate}. */
export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
  /** Entry-local browser history state. It is not serialized into the URL or sent to the server. */
  state?: unknown;
  /**
   * Throw a `TypeError` for any target on another origin, including an
   * explicit `http:`/`https:` URL, which `navigate()` otherwise hands to the
   * browser. Use it when the target came from untrusted input.
   */
  sameOrigin?: boolean;
  /**
   * Animate the page change with `document.startViewTransition()` when the
   * browser has it; otherwise the navigation commits directly. Overrides the
   * `viewTransitions` app option for this navigation.
   */
  viewTransition?: boolean;
};

export type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
  /** Blockers were consulted by the caller (a traversal, a session retry). */
  skipBlockers?: boolean;
  /** Blocker messages the visitor already confirmed during this navigation. */
  confirmed?: Set<string>;
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
      (isCurrentAppRegistration(target.app) &&
        target.app.instance.appRuntime === target.runtime)
  );
}

export function isRenderResult(
  result: RouteRequestResult
): result is RouteRenderResult {
  return result !== null && result.kind === 'render';
}
