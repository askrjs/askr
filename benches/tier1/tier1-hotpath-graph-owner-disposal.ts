import { describe, expect, test } from 'vite-plus/test';
import { Computation, Signal } from '../../src/core/reactive/graph';
import { Owner } from '../../src/core/reactive/owner';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const branches = 10;
const levels = 4;

/** A tree of owners, each with a subscribed computation and a cleanup. */
function buildTree(source: Signal<number>, counters: { cleanups: number }) {
  const root = new Owner(null);
  let owners = 1;
  let computations = 0;
  const grow = (parent: Owner, level: number): void => {
    if (level === levels) return;
    for (let index = 0; index < branches; index += 1) {
      const owner = new Owner(parent);
      owners += 1;
      owner.onCleanup(() => {
        counters.cleanups += 1;
      });
      const computation = new Computation<number>(
        owner,
        () => source.read() + index,
        null
      );
      computation.read();
      computations += 1;
      grow(owner, level + 1);
    }
  };
  grow(root, 0);
  return { root, owners, computations };
}

verifyTier1Invariant('tier1 hotpath graph owner disposal', () => {
  const source = new Signal(0);
  const counters = { cleanups: 0 };
  const tree = buildTree(source, counters);
  expect(tree.owners).toBe(1 + 10 + 100 + 1_000 + 10_000);
  expect(source._observers?.size).toBe(tree.computations);
  const errors = tree.root.dispose();
  expect(errors).toEqual([]);
  expect(counters.cleanups).toBe(tree.owners - 1);
  expect(source._observers?.size ?? 0).toBe(0);
});

describe('tier1 graph owner disposal', () => {
  test('build and dispose an 11,111-owner tree', async ({ bench }) => {
    const source = new Signal(0);
    const counters = { cleanups: 0 };
    await runBench(
      bench,
      'build and dispose an 11,111-owner tree',
      () => {
        const tree = buildTree(source, counters);
        tree.root.dispose();
      },
      {
        ...tier1BenchOptions,
        teardown() {
          if (counters.cleanups === 0) {
            throw new Error('owner tree was not disposed');
          }
        },
      }
    );
  });
});
