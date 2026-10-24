import { describe, expect, test } from 'vite-plus/test';
import { resolveRouteFromRoutes } from '../../src/router/route-matching';
import {
  buildDenseRouteTable,
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const fixture = buildDenseRouteTable(512);
// A filler route deep in the table, and a path only the catch-all accepts.
const fillerPath = '/section-301/kind-x/item/9';
const missPath = '/nothing/registered/here/at/all';
// The matcher memoizes its last answer. Each row alternates its target with
// a second path so every call resolves instead of reading the memo.
const alternatePath = '/section-7/bucket-7/item/detail';
let flip = false;
function alternating(path: string): string {
  flip = !flip;
  return flip ? path : alternatePath;
}
verifyTier1Invariant('tier1 hotpath router longest match', () => {
  const resolved = resolveRouteFromRoutes(fixture.targetPath, fixture.routes);
  expect(fixture.routes).toHaveLength(512);
  expect(resolved).not.toBeNull();
  expect(resolved!.handler).toBe(fixture.expectedHandler);
  expect(resolved!.params).toEqual(fixture.expectedParams);
  expect(resolveRouteFromRoutes(fillerPath, fixture.routes)?.params).toEqual({
    kind: 'kind-x',
    id: '9',
  });
  expect(resolveRouteFromRoutes(missPath, fixture.routes)?.params).toEqual({
    '*': missPath,
  });
});

describe('tier1 hotpath router longest match', () => {
  test('resolve the most specific route from a 512-route dense table (alternating)', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'resolve the most specific route from a 512-route dense table (alternating)',
      () => {
        const match = resolveRouteFromRoutes(
          alternating(fixture.targetPath),
          fixture.routes
        );
        if (!match) {
          throw new Error('expected dense route table to resolve a match');
        }
      },
      tier1BenchOptions
    );
  });

  test('resolve a filler route deep in a 512-route dense table (alternating)', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'resolve a filler route deep in a 512-route dense table (alternating)',
      () => {
        if (!resolveRouteFromRoutes(alternating(fillerPath), fixture.routes)) {
          throw new Error('expected the filler route to resolve');
        }
      },
      tier1BenchOptions
    );
  });

  test('resolve a miss to the catch-all of a 512-route dense table (alternating)', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'resolve a miss to the catch-all of a 512-route dense table (alternating)',
      () => {
        if (!resolveRouteFromRoutes(alternating(missPath), fixture.routes)) {
          throw new Error('expected the miss to reach the catch-all');
        }
      },
      tier1BenchOptions
    );
  });
});
