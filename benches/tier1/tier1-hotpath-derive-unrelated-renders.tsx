import { describe, expect, test } from 'vite-plus/test';
import { derive, state } from '../../src';
import { createIsland } from '../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

/** A component that renders on every `unrelated` write and owns 20 derives. */
function mountFixture() {
  const { container, cleanup } = createTestContainer();
  const stats = { computes: 0, renders: 0 };
  let relatedState!: ReturnType<typeof state<number>>;
  let unrelatedState!: ReturnType<typeof state<number>>;

  const Component = () => {
    stats.renders += 1;
    relatedState = state(0);
    unrelatedState = state(0);
    const derived = Array.from({ length: 20 }, (_, index) =>
      derive(() => {
        stats.computes += 1;
        return relatedState() + index;
      })
    );
    return (
      <div data-unrelated={unrelatedState()}>
        {derived.map((read) => (
          <span>{read()}</span>
        ))}
      </div>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();
  return {
    container,
    cleanup,
    stats,
    related: () => relatedState,
    unrelated: () => unrelatedState,
  };
}

verifyTier1Invariant('tier1 hotpath derive unrelated renders', () => {
  const fixture = mountFixture();
  try {
    expect(fixture.container.querySelectorAll('span')).toHaveLength(20);
    const computes = fixture.stats.computes;
    const renders = fixture.stats.renders;
    fixture.unrelated().set(1);
    flushScheduler();
    expect(fixture.stats.renders).toBe(renders + 1);
    // A derive recomputes at most once per render; record how many did.
    expect(fixture.stats.computes - computes).toBeLessThanOrEqual(20);
    fixture.related().set(5);
    flushScheduler();
    expect(fixture.container.querySelector('span')?.textContent).toBe('5');
  } finally {
    fixture.cleanup();
  }
});

describe('tier1 derive unrelated renders', () => {
  let fixture: ReturnType<typeof mountFixture> | null = null;
  let count = 0;

  test('re-render a component with 20 derives for an unrelated write', async ({
    bench,
  }) => {
    await runBench(
      bench,
      're-render a component with 20 derives for an unrelated write',
      () => {
        count += 1;
        fixture!.unrelated().set(count);
        flushScheduler();
      },
      {
        ...tier1BenchOptions,
        setup() {
          fixture = mountFixture();
          count = 0;
        },
        teardown() {
          fixture?.cleanup();
          fixture = null;
        },
      }
    );
  });
});
