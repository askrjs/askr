import type { ComponentFunction } from '../runtime';
import type {
  Route,
  RouteAuthOptions,
  RouteManifest,
  RouteRegistry,
} from '../common/router';
import type { ScrollRestorationOptions } from '../router/navigate';

export type IslandConfig = {
  root: Element | string;
  component: ComponentFunction;
  // Optional: surface cleanup errors during teardown for this island.
  cleanupStrict?: boolean;
  // Explicitly disallow routes on islands at type level.
  routes?: never;
};

export type IslandsConfig = {
  islands: IslandConfig[];
};

type BootRouteSource =
  | {
      registry: RouteRegistry;
      manifest?: RouteManifest;
      routes?: Route[];
    }
  | {
      manifest: RouteManifest;
      registry?: RouteRegistry;
      routes?: Route[];
    }
  | {
      manifest?: RouteManifest;
      registry?: RouteRegistry;
      routes: Route[];
    };

export type SPAConfig = BootRouteSource & {
  root: Element | string;
  /**
   * Preferred: pass a route registry built via `createRouteRegistry(() => { ... })`.
   * ```ts
   * import { createRouteRegistry } from '@askrjs/askr/router';
   * const registry = createRouteRegistry(() => { ... });
   * await createSPA({ root: '#app', registry });
   * ```
   */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  /** Preferred route input - see `SPAConfig`. */
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

export type BootAppRouteSource = {
  manifest?: RouteManifest;
  routes?: readonly Route[];
  auth?: RouteAuthOptions;
};
