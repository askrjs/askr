/**
 * bench_state_deep_tree_cross_component_burst
 *
 * Pure characterization bench.
 *
 * Rules (enforced by structure):
 * - No calibration / pre-runs during module init or describe()
 * - All work happens inside bench() bodies
 * - One benchmark = one (depth, burstSize) pair
 * - Fresh island per bench invocation
 * - Warm up once (warmupIterations=1), then measure steady-state only
 * - For each measurement: apply burstSize updates; call flushScheduler() exactly once
 * - No retained state across iterations
 * - No extra math/classification/logging
 */

import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

const DEPTHS = [10, 25, 50] as const;
const BURST_SIZES = [100, 1000] as const;

function runOne(depth: number, burstSize: number): void {
  const { container, cleanup } = createTestContainer();

  let root: State<number> | null = null;
  let mid: State<number> | null = null;
  let leaf: State<number> | null = null;

  const Sibling = () => {
    // Cross-component read.
    return <span>{root!()}</span>;
  };

  const App = () => {
    root = state(0);
    mid = state(0);
    leaf = state(0);

    // Build a deep subscription chain without recursive component calls.
    let subtree: any = <span>{root() + mid() + leaf()}</span>;
    for (let d = 0; d < depth; d++) {
      const v = root() + mid();
      subtree = (
        <div data-depth={d}>
          {v}
          {subtree}
        </div>
      );
    }

    return (
      <div>
        <Sibling />
        {subtree}
      </div>
    );
  };

  createIsland({ root: container, component: App as any });
  flushScheduler();

  if (!root || !mid || !leaf) {
    cleanup();
    throw new Error('Benchmark setup failed to capture states');
  }

  const rootState: State<number> = root;
  const midState: State<number> = mid;
  const leafState: State<number> = leaf;

  for (let i = 0; i < burstSize; i++) {
    // Cross-component propagation via reads + writes across boundaries.
    const r = rootState();
    const m = midState();
    rootState.set(r + 1);
    midState.set(r);
    leafState.set(m);
  }

  // Exactly one flush per measurement.
  flushScheduler();

  cleanup();
}

describe('bench_state_deep_tree_cross_component_burst', () => {
  for (const depth of DEPTHS) {
    for (const burstSize of BURST_SIZES) {
      bench(
        `bench_state/depth=${depth}/burst=${burstSize}`,
        async () => runOne(depth, burstSize),
        {
          // Ensure each sample is large enough that the timer resolution
          // doesn't collapse results into NaN (see benches/state/burst-updates).
          iterations: 5,
          warmupIterations: 1,
        }
      );
    }
  }
});
