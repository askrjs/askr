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
    return <span>{root!()}</span>;
  };

  const App = () => {
    root = state(0);
    mid = state(0);
    leaf = state(0);

    let subtree: unknown = <span>{root() + mid() + leaf()}</span>;
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

  const component = App as unknown as Parameters<
    typeof createIsland
  >[0]['component'];
  createIsland({ root: container, component });
  flushScheduler();

  if (!root || !mid || !leaf) {
    cleanup();
    throw new Error('Benchmark setup failed to capture states');
  }

  const rootState: State<number> = root;
  const midState: State<number> = mid;
  const leafState: State<number> = leaf;

  for (let i = 0; i < burstSize; i++) {
    const r = rootState();
    const m = midState();
    rootState.set(r + 1);
    midState.set(r);
    leafState.set(m);
  }

  flushScheduler();
  cleanup();
}

describe('deep tree burst updates', () => {
  for (const depth of DEPTHS) {
    for (const burstSize of BURST_SIZES) {
      bench(
        `depth ${depth} burst ${burstSize}`,
        async () => runOne(depth, burstSize),
        {
          iterations: 5,
          warmupIterations: 1,
        }
      );
    }
  }
});
