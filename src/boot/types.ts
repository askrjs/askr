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
      /** @deprecated Use `registry` for new applications. */
      manifest?: RouteManifest;
      /** @deprecated Use `registry` for new applications. */
      routes?: Route[];
    }
  | {
      /** @deprecated Use `registry` for new applications. */
      manifest: RouteManifest;
      registry?: RouteRegistry;
      /** @deprecated Use `registry` for new applications. */
      routes?: Route[];
    }
  | {
      /** @deprecated Use `registry` for new applications. */
      manifest?: RouteManifest;
      registry?: RouteRegistry;
      /** @deprecated Use `registry` for new applications. */
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
   * Deprecated: pass `manifest` or `routes` only for legacy code.
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
  /** Preferred: pass `registry`; `manifest` and `routes` are deprecated legacy inputs. */
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
