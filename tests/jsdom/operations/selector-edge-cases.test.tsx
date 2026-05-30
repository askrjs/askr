import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { selector, state } from '../../../src/index';
import { For } from '../../../src/control';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type LaneProbe = {
  _lane?: {
    _primitiveCandidates: Map<unknown, unknown>;
    _objectCandidateSources: Set<unknown>;
  } | null;
};

describe('selector edge cases', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  // Finding 8 (DEBATABLE): the default-equals notify path calls
  // getCandidateSource(lane, prev/next), which creates and caches a candidate
  // source even for values no component ever read. Setting the source to a
  // series of never-read values should not grow the candidate cache.
  it('should not materialize candidate sources for values that were never read', () => {
    let selected!: ReturnType<typeof state<number | null>>;
    let probe!: LaneProbe;

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(selected);
      probe = isSelected as unknown as LaneProbe;
      return <div class={() => (isSelected(id) ? 'danger' : '')}>{id}</div>;
    };

    const App = () => {
      selected = state<number | null>(null);
      return (
        <section>
          <For each={() => [1, 2, 3]} by={(item) => item}>
            {(item) => <Row id={item} />}
          </For>
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    // Only candidates 1, 2, 3 were ever read.
    const baseline = probe._lane?._primitiveCandidates.size ?? 0;

    // Select a series of values that NO row reads.
    selected.set(100);
    flushScheduler();
    selected.set(200);
    flushScheduler();
    selected.set(300);
    flushScheduler();

    const after = probe._lane?._primitiveCandidates.size ?? 0;

    // Phantom values (100/200/300/null) must not accumulate as candidate sources.
    expect(after).toBe(baseline);
  });

  // Finding 9 (PROBE): NaN candidate with default Object.is equality.
  it('should match a NaN candidate when the source becomes NaN', () => {
    let selected!: ReturnType<typeof state<number | null>>;

    const Row = () => {
      const isSelected = selector(selected);
      return (
        <div class={() => (isSelected(Number.NaN) ? 'danger' : '')}>row</div>
      );
    };

    const App = () => {
      selected = state<number | null>(null);
      return <Row />;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect((container.querySelector('div') as HTMLElement).className).toBe('');

    selected.set(Number.NaN);
    flushScheduler();

    expect((container.querySelector('div') as HTMLElement).className).toBe(
      'danger'
    );
  });

  // Finding 10 (PROBE): a selector source that throws. Document that the error
  // surfaces rather than being silently swallowed, and that the record is not
  // left holding a phantom value.
  it('should surface an error thrown by the selector source during render', () => {
    const App = () => {
      const source = (): number => {
        throw new Error('selector-source-boom');
      };
      const isSelected = selector(source);
      return <div class={() => (isSelected(1) ? 'danger' : '')}>row</div>;
    };

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).toThrow(/selector-source-boom/);
  });
});
