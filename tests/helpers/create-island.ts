import { createIslands } from '../../src/index';

export type Island = Parameters<typeof createIslands>[0]['islands'][number];

export function createIsland(island: Island) {
  return createIslands({ islands: [island] });
}
