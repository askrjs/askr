/** Stable bootstrap exports; each mounting mode owns its orchestration. */
export { createIsland, createIslands } from './islands';
export { createSPA } from './spa';
export { hydrateSPA } from './hydrate-spa';
export { cleanupApp, hasApp } from './root-lifecycle';
export type {
  HydrateSPAConfig,
  IslandConfig,
  IslandsConfig,
  SPAConfig,
} from './types';
