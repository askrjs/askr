import { describe, expect, test } from 'vite-plus/test';
import { Computation, Signal } from '../../src/core/reactive/graph';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const branchWidth = 50;

function buildGraph() {
  const useLeft = new Signal(true);
  const left = Array.from({ length: branchWidth }, (_, i) => new Signal(i));
  const right = Array.from({ length: branchWidth }, (_, i) => new Signal(-i));
  let runs = 0;
  const total = new Computation<number>(
    null,
    () => {
      runs += 1;
      const branch = useLeft.read() ? left : right;
      let sum = 0;
      for (const signal of branch) sum += signal.read();
      return sum;
    },
    null
  );
  return { useLeft, left, right, total, runs: () => runs };
}

verifyTier1Invariant('tier1 hotpath graph dynamic deps', () => {
  const graph = buildGraph();
  const leftSum = (branchWidth * (branchWidth - 1)) / 2;
  expect(graph.total.read()).toBe(leftSum);
  graph.useLeft.write(false);
  expect(graph.total.read()).toBe(-leftSum);
  // The abandoned branch no longer drives the computation.
  const runs = graph.runs();
  graph.left[0]!.write(1_000);
  expect(graph.total.read()).toBe(-leftSum);
  expect(graph.runs()).toBe(runs);
  graph.right[1]!.write(0);
  expect(graph.total.read()).toBe(-leftSum + 1);
  expect(graph.runs()).toBe(runs + 1);
});

describe('tier1 graph dynamic deps', () => {
  let graph: ReturnType<typeof buildGraph> | null = null;
  let flip = false;

  test('switch a computation between two 50-source branches', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'switch a computation between two 50-source branches',
      () => {
        flip = !flip;
        graph!.useLeft.write(!flip);
        graph!.total.read();
      },
      {
        ...tier1BenchOptions,
        setup() {
          graph = buildGraph();
          graph.total.read();
        },
        teardown() {
          graph = null;
        },
      }
    );
  });
});
