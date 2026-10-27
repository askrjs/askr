import { describe, expect, test } from 'vite-plus/test';
import { Computation, Signal } from '../../src/core/reactive/graph';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const depth = 5_000;

function buildChain() {
  const source = new Signal(0);
  let previous: () => number = () => source.read();
  let top!: Computation<number>;
  for (let index = 0; index < depth; index += 1) {
    const read = previous;
    const node = new Computation<number>(null, () => read() + 1, null);
    // Evaluate bottom-up so building the chain does not recurse.
    node.read();
    previous = () => node.read();
    top = node;
  }
  return { source, top };
}

verifyTier1Invariant('tier1 hotpath graph deep chain', () => {
  const { source, top } = buildChain();
  expect(top.read()).toBe(depth);
  source.write(7);
  expect(top.read()).toBe(depth + 7);
  source.write(8);
  expect(top.read()).toBe(depth + 8);
});

describe('tier1 graph deep chain', () => {
  let chain: ReturnType<typeof buildChain> | null = null;
  let next = 0;

  test('update a 5,000-deep derived chain', async ({ bench }) => {
    await runBench(
      bench,
      'update a 5,000-deep derived chain',
      () => {
        next += 1;
        chain!.source.write(next);
        if (chain!.top.read() !== depth + next) {
          throw new Error('deep chain did not update');
        }
      },
      {
        ...tier1BenchOptions,
        setup() {
          chain = buildChain();
          next = 0;
        },
        teardown() {
          chain = null;
        },
      }
    );
  });
});
