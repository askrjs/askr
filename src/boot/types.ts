import type { ComponentFunction } from '../common/component';
import type { RouteAuthOptions, RouteRegistry } from '../common/router';
import type {
  NavigationFocusOptions,
  ScrollRestorationOptions,
  ViewTransitionsOption,
} from '../router/navigate';
import type { AppRenderRuntime } from '../common/app-render-runtime';

/** Configuration for {@link createIsland}: mounts one component onto existing DOM. */
export type IslandConfig = {
  root: Element | string;
  component: ComponentFunction;
  cspNonce?: string;
  /**
   * Adopt the container's existing elements instead of replacing them. An
   * object adopts and receives mismatch reports.
   * Defaults to `true` when the container already has element children;
   * `false` always replaces, `true` always adopts. A mismatch falls back to
   * client-rendered nodes as hydration does.
   */
  hydrate?:
    | boolean
    | {
        /**
         * Called with the DOM path and the expected and found nodes for each
         * server/client difference; the island patches the markup and proceeds.
         */
        onMismatch?: (info: {
          path: string;
          expected: string;
          actual: string;
        }) => void;
      };
  /** Optional data runtime owned by this island's render and event lifecycle. */
  dataRuntime?: import('../data/types').DataRuntime;
  // Optional: surface cleanup errors during teardown for this island.
  cleanupStrict?: boolean;
  // Explicitly disallow routes on islands at type level.
  routes?: never;
};

/** Configuration for {@link createIslands}: mounts several islands at once. */
export type IslandsConfig = {
  islands: IslandConfig[];
  cspNonce?: string;
};

type BootRouteSource = {
  /** Pass a route registry built via `createRouteRegistry()`; hydration uses the one the server rendered with. */
  registry: RouteRegistry;
};

/** Configuration for {@link createSPA}. */
export type SPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  /** Optional data runtime, primarily for routed test fixtures. */
  dataRuntime?: import('../data/types').DataRuntime;
  /** Auth resolution and redirect options; defaults to the registry's `auth`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  /**
   * Focus and announcement after a push navigation. On by default: focus moves
   * to the first `[data-askr-focus-target]`, else `<main>`, else the first
   * `<h1>`, else the root, and a visually hidden polite live region announces
   * the new document title (the pathname without one). `false` turns both off.
   */
  focus?: false | NavigationFocusOptions;
  /**
   * Animate page changes with `document.startViewTransition()`. `true`
   * animates every navigation (including back/forward), a function decides per
   * navigation from the departing and arriving hrefs, and the default `false`
   * never does unless a navigation asks (`navigate(target, { viewTransition:
   * true })`, `<Link viewTransition>`). Browsers without the API commit
   * directly.
   */
  viewTransitions?: ViewTransitionsOption;
  cleanupStrict?: boolean;
  component?: never;
};

/** Configuration for {@link hydrateSPA}. */
export type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  dataRuntime?: import('../data/types').DataRuntime;
  /** Auth resolution and redirect options; defaults to the registry's `auth`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  /** Focus and announcement after a push navigation; see {@link SPAConfig.focus}. */
  focus?: false | NavigationFocusOptions;
  /** View transitions between pages; see {@link SPAConfig.viewTransitions}. */
  viewTransitions?: ViewTransitionsOption;
  cleanupStrict?: boolean;
  hydrate?: {
    verifyMarkup?: boolean;
    /**
     * Called with the DOM path and the expected and found nodes for each
     * server/client difference. In verify mode, returning `'continue'` patches
     * the markup and proceeds instead of failing hydration.
     */
    onMismatch?: (info: {
      path: string;
      expected: string;
      actual: string;
    }) => 'continue' | void;

    deferUntilIdle?: boolean;
    deferBelowFold?: boolean;
    foldThreshold?: number;
    skipSelectors?: string[];
  };
};

export type BootAppRouteSource = {
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  /** @internal Browser render state owned by this application root. */
  runtime?: AppRenderRuntime;
};
