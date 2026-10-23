import { describe, expect, test } from 'vite-plus/test';
import { Computation, Signal } from '../../src/core/reactive/graph';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const width = 1_000;

function buildGraph() {
  const source = new Signal(0);
  let midRuns = 0;
  let topRuns = 0;
  const mids = Array.from({ length: width }, (_, index) => {
    const mid = new Computation<number>(
      null,
      () => {
        midRuns += 1;
        return (source.read() + index) % 2;
      },
      null
    );
    return mid;
  });
  const top = new Computation<number>(
    null,
    () => {
      topRuns += 1;
      let sum = 0;
      for (const mid of mids) sum += mid.read();
      return sum;
    },
    null
  );
  return { source, top, midRuns: () => midRuns, topRuns: () => topRuns };
}

verifyTier1Invariant('tier1 hotpath graph wide cutoff', () => {
  const graph = buildGraph();
  expect(graph.top.read()).toBe(width / 2);
  const mids = graph.midRuns();
  const tops = graph.topRuns();
  // Parity is unchanged: every mid recomputes, none changes, the top is cut off.
  graph.source.write(2);
  expect(graph.top.read()).toBe(width / 2);
  expect(graph.midRuns()).toBe(mids + width);
  expect(graph.topRuns()).toBe(tops);
  // Parity flips: every mid changes and the top recomputes once.
  graph.source.write(3);
  expect(graph.top.read()).toBe(width / 2);
  expect(graph.topRuns()).toBe(tops + 1);
});

describe('tier1 graph wide cutoff', () => {
  let graph: ReturnType<typeof buildGraph> | null = null;
  let value = 0;

  test('recompute 1,000 derived values whose parity is unchanged', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'recompute 1,000 derived values whose parity is unchanged',
      () => {
        value += 2;
        graph!.source.write(value);
        graph!.top.read();
      },
      {
        ...tier1BenchOptions,
        setup() {
          graph = buildGraph();
          graph.top.read();
          value = 0;
        },
        teardown() {
          graph = null;
        },
      }
    );
  });
});
