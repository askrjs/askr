import {
  RouteAuthOptions,
  RouteRegistry,
  ComponentFunction,
  DataRuntime,
} from '../core.js';
import { ScrollRestorationOptions } from '../navigation.js';
/** Configuration for {@link createIsland}: mounts one component onto existing DOM. */
type IslandConfig = {
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
  dataRuntime?: DataRuntime;
  cleanupStrict?: boolean;
  routes?: never;
};
/** Configuration for {@link createIslands}: mounts several islands at once. */
type IslandsConfig = {
  islands: IslandConfig[];
  cspNonce?: string;
};
type BootRouteSource = {
  /** Pass a route registry built via `createRouteRegistry()`; hydration uses the one the server rendered with. */
  registry: RouteRegistry;
};
/** Configuration for {@link createSPA}. */
type SPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  /** Optional data runtime, primarily for routed test fixtures. */
  dataRuntime?: DataRuntime;
  /** Auth resolution and redirect options; defaults to the registry's `auth`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  /**
   * Focus and announcement after a push navigation. On by default: focus moves
   * to the first `[data-askr-focus-target]`, else `<main>`, else the first
   * `<h1>`, else the root, and a visually hidden polite live region announces
   * the new document title (the pathname without one). `false` turns both off.
   */
  focus?:
    | false
    | {
        target?: string | ((root: Element) => Element | null);
        announce?:
          | false
          | ((route: {
              readonly pathname: string;
              readonly search: string;
              readonly hash: string;
              readonly title: string;
            }) => string);
      };
  cleanupStrict?: boolean;
  component?: never;
};
/** Configuration for {@link hydrateSPA}. */
type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  dataRuntime?: DataRuntime;
  /** Auth resolution and redirect options; defaults to the registry's `auth`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  /** Focus and announcement after a push navigation; see `SPAConfig.focus`. */
  focus?:
    | false
    | {
        target?: string | ((root: Element) => Element | null);
        announce?:
          | false
          | ((route: {
              readonly pathname: string;
              readonly search: string;
              readonly hash: string;
              readonly title: string;
            }) => string);
      };
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
/**
 * Tear down the app mounted at `root`: runs its cleanup callbacks, clears
 * route state if it was the last routed root, and removes bookkeeping for
 * the root element.
 */
declare function cleanupApp(root: Element | string): void;
/** Check whether an app instance is currently mounted at `root`. */
declare function hasApp(root: Element | string): boolean;
/** Replace the data owner of a live app without remounting or disposing the previous runtime. */
declare function replaceDataRuntime(
  root: Element | string,
  next: DataRuntime
): void;
/**
 * createIsland: Enhances existing DOM (no router, mounts once)
 */
declare function createIsland(config: IslandConfig): void;
/**
 * createIslands: Enhances one or more existing DOM roots (no router).
 * The only public islands constructor.
 */
declare function createIslands(config: IslandsConfig): void;
/**
 * createSPA: Initializes the router and mounts the app with an explicit route registry.
 * ```ts
 * import { createRouteRegistry } from '@askrjs/askr/router';
 * const registry = createRouteRegistry(() => { ... });
 * await createSPA({ root: '#app', registry });
 * ```
 *
 */
declare function createSPA(config: SPAConfig): Promise<void>;
/**
 * hydrateSPA: Hydrate server-rendered HTML with an explicit route registry.
 */
declare function hydrateSPA(config: HydrateSPAConfig): Promise<void>;
export {
  type HydrateSPAConfig,
  type IslandConfig,
  type IslandsConfig,
  type SPAConfig,
  cleanupApp,
  createIsland,
  createIslands,
  createSPA,
  hasApp,
  hydrateSPA,
  replaceDataRuntime,
};
