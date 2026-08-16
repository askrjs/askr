import { bench, describe, expect } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import { createTestContainer } from '../../test-utils/render/test-renderer';
import { tier2BenchOptions } from '../shared/_shared';

const regressionDepth = 10_000;
const benchmarkDepth = 1_000;

function Nested({ remaining }: { remaining: number }) {
  return remaining === 0 ? (
    <button data-depth-leaf="true">leaf</button>
  ) : (
    <Nested remaining={remaining - 1} />
  );
}

function mountComponentChain(depth: number): () => void {
  const fixture = createTestContainer();
  createIsland({
    root: fixture.container,
    component: () => <Nested remaining={depth} />,
  });
  expect(
    fixture.container.querySelector('[data-depth-leaf="true"]')?.textContent
  ).toBe('leaf');
  return fixture.cleanup;
}

{
  const cleanup = mountComponentChain(regressionDepth);
  cleanup();
}

describe('tier2 runtime component depth', () => {
  bench(
    'mount and clean up a 1,000-component wrapper chain',
    () => {
      const cleanup = mountComponentChain(benchmarkDepth);
      cleanup();
    },
    tier2BenchOptions
  );
});
