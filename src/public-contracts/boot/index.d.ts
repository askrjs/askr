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
  registry: RouteRegistry;
};
/** Configuration for {@link createSPA}. */
type SPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  /** Optional data runtime, primarily for routed test fixtures. */
  dataRuntime?: DataRuntime;
  /** Pass a route registry built via `createRouteRegistry(() => { ... })`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  component?: never;
};
/** Configuration for {@link hydrateSPA}. */
type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  dataRuntime?: DataRuntime;
  /** Pass the same explicit route registry used for the server render. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  hydrate?: {
    verifyMarkup?: boolean;
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
};
