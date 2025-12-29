/**
 * Askr: Actor-backed deterministic UI framework
 *
 * Public API surface — autopilot-safe core only.
 *
 * Root exports are intentionally minimal and free of timing/lifecycle nuance.
 * Lower tiers are exposed via explicit subpaths:
 * - askr/resources  (async data policy)
 * - askr/fx         (timing / side effects)
 */

// Constructors (execution models)
export { createSPA, createIsland } from './boot';
export type { SPAConfig, IslandConfig } from './boot';

// Core sync data
export { state } from './runtime/state';
export type { State } from './runtime/state';
export { derive } from './runtime/derive';

// Essential public types
export type { Props } from './common/props';
