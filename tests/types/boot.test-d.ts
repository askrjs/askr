import { expectAssignable, expectError, expectType } from 'tsd';
import {
  cleanupApp,
  createIsland,
  createIslands,
  createSPA,
  hasApp,
  hydrateSPA,
  type HydrateSPAConfig,
  type IslandConfig,
  type IslandsConfig,
  type SPAConfig,
} from '@askrjs/askr/boot';
import type { Route, RouteManifest, RouteRegistry } from '@askrjs/askr/router';

declare const manifest: RouteManifest;
declare const routes: Route[];
declare const registry: RouteRegistry;

const islandConfig: IslandConfig = {
  root: document.body,
  component: () => null,
};

expectAssignable<IslandConfig>(islandConfig);
expectType<void>(createIsland(islandConfig));

const islandsConfig: IslandsConfig = {
  islands: [islandConfig],
};
expectAssignable<IslandsConfig>(islandsConfig);
expectType<void>(createIslands(islandsConfig));

const spaManifestConfig: SPAConfig = {
  root: document.body,
  manifest,
};
expectAssignable<SPAConfig>(spaManifestConfig);
expectType<Promise<void>>(createSPA(spaManifestConfig));

const spaRoutesConfig: SPAConfig = {
  root: document.body,
  routes,
};
expectAssignable<SPAConfig>(spaRoutesConfig);
expectType<Promise<void>>(createSPA(spaRoutesConfig));

const spaRegistryConfig: SPAConfig = {
  root: document.body,
  registry,
};
expectAssignable<SPAConfig>(spaRegistryConfig);
expectType<Promise<void>>(createSPA(spaRegistryConfig));

const hydrateManifestConfig: HydrateSPAConfig = {
  root: document.body,
  manifest,
};
expectAssignable<HydrateSPAConfig>(hydrateManifestConfig);
expectType<Promise<void>>(hydrateSPA(hydrateManifestConfig));

const hydrateRoutesConfig: HydrateSPAConfig = {
  root: document.body,
  routes,
};
expectAssignable<HydrateSPAConfig>(hydrateRoutesConfig);
expectType<Promise<void>>(hydrateSPA(hydrateRoutesConfig));

const hydrateRegistryConfig: HydrateSPAConfig = {
  root: document.body,
  registry,
};
expectAssignable<HydrateSPAConfig>(hydrateRegistryConfig);
expectType<Promise<void>>(hydrateSPA(hydrateRegistryConfig));

expectType<void>(cleanupApp(document.body));
expectType<boolean>(hasApp(document.body));

expectError(
  createIsland({
    root: document.body,
    component: () => null,
    routes,
  })
);
expectError(createSPA({ root: document.body }));
expectError(hydrateSPA({ root: document.body }));
