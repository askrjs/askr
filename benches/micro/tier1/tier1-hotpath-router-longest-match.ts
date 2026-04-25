import { bench, describe, expect } from 'vite-plus/test';
import { resolveRouteFromRoutes } from '../../../src/router/route';
import {
  buildDenseRouteTable,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../../shared/_shared';

const fixture = buildDenseRouteTable(512);
verifyTier1Invariant('tier1 hotpath router longest match', () => {
  const resolved = resolveRouteFromRoutes(fixture.targetPath, fixture.routes);
  expect(fixture.routes).toHaveLength(512);
  expect(resolved).not.toBeNull();
  expect(resolved!.handler).toBe(fixture.expectedHandler);
  expect(resolved!.params).toEqual(fixture.expectedParams);
});

describe('tier1 hotpath router longest match', () => {
  bench(
    'resolve the most specific route from a 512-route dense table',
    () => {
      const match = resolveRouteFromRoutes(fixture.targetPath, fixture.routes);
      if (!match) {
        throw new Error('expected dense route table to resolve a match');
      }
    },
    tier1BenchOptions
  );
});
