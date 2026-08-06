import type { ComponentFunction } from '../runtime';
import type { RouteAuthOptions, RouteRegistry } from '../common/router';
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

type BootRouteSource = { registry: RouteRegistry };

export type SPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  /** Optional data runtime, primarily for routed test fixtures. */
  dataRuntime?: import('../data/types').DataRuntime;
  /** Pass a route registry built via `createRouteRegistry(() => { ... })`. */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  cspNonce?: string;
  dataRuntime?: import('../data/types').DataRuntime;
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

export type BootAppRouteSource = {
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  /** @internal Browser render state owned by this application root. */
  runtime?: AppRenderRuntime;
};
