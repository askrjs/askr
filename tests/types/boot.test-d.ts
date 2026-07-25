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
import type { RouteRegistry } from '@askrjs/askr/router';

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

const spaRegistryConfig: SPAConfig = {
  root: document.body,
  registry,
};
expectAssignable<SPAConfig>(spaRegistryConfig);
expectType<Promise<void>>(createSPA(spaRegistryConfig));

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
    routes: [],
  })
);
expectError(createSPA({ root: document.body }));
expectError(hydrateSPA({ root: document.body }));
