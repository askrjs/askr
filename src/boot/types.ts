import type { ComponentFunction } from '../runtime';
import type {
  Route,
  RouteAuthOptions,
  RouteManifest,
  RouteRegistry,
} from '../common/router';
import type { ScrollRestorationOptions } from '../router/navigate';
import type { AppRenderRuntime } from '../common/app-render-runtime';

export type IslandConfig = {
  root: Element | string;
  component: ComponentFunction;
  cspNonce?: string;
  // Optional: surface cleanup errors during teardown for this island.
  cleanupStrict?: boolean;
  // Explicitly disallow routes on islands at type level.
  routes?: never;
};

export type IslandsConfig = {
  islands: IslandConfig[];
  cspNonce?: string;
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
  cspNonce?: string;
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
  cspNonce?: string;
  dataRuntime?: import('../data/types').DataRuntime;
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
  /** @internal Browser render state owned by this application root. */
  runtime?: AppRenderRuntime;
};
