import {
  createIsland as mountIsland,
  type IslandConfig,
} from '../../src/index';

export type Island = IslandConfig;

export function createIsland(island: Island) {
  return mountIsland(island);
}
