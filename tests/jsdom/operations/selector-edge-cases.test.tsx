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

  it('should isolate a throwing selector from dirty siblings in the same batch', () => {
    let throwingSource!: ReturnType<typeof state<number>>;
    let safeSource!: ReturnType<typeof state<number>>;

    const App = () => {
      throwingSource = state(0);
      safeSource = state(0);
      const isThrowingSelected = selector(() => {
        const value = throwingSource();
        if (value === 1) {
          throw new Error('selector-batch-boom');
        }
        return value;
      });
      const isSafeSelected = selector(() => safeSource());

      return (
        <div>
          <output id="throwing">
            {() => (isThrowingSelected(1) ? 'yes' : 'no')}
          </output>
          <output id="safe">{() => (isSafeSelected(1) ? 'yes' : 'no')}</output>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    throwingSource.set(1);
    safeSource.set(1);
    expect(() => flushScheduler()).toThrow(/selector-batch-boom/);
    expect(container.querySelector('#safe')?.textContent).toBe('yes');

    safeSource.set(2);
    expect(() => flushScheduler()).not.toThrow();
    expect(container.querySelector('#safe')?.textContent).toBe('no');
  });

  it('should reject a leaked selector call after its owner is disposed', () => {
    let shared!: ReturnType<typeof state<number>>;
    let leaked!: (candidate: number) => boolean;

    const App = () => {
      shared = state(2);
      leaked = selector(shared);
      return <output>{leaked(2) ? 'yes' : 'no'}</output>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(shared._derivedSubscribers?.size ?? 0).toBe(1);

    cleanup();
    expect(shared._derivedSubscribers?.size ?? 0).toBe(0);
    expect(() => leaked(2)).toThrow(/selector.*disposed/i);
    expect(shared._derivedSubscribers?.size ?? 0).toBe(0);
  });
});
