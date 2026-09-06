import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { For } from '../../../src/control';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { resource, task } from '../../../src/resources';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type RowSpec = {
  id: number;
  kind: 'retained' | 'provisional' | 'replacement';
};

describe('transactional keyed removal side effects', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should preserve a removed owner and discard provisional work when its replacement commit fails', async () => {
    const retainedSpec: RowSpec = { id: 1, kind: 'retained' };
    const failingSpec: RowSpec = { id: 2, kind: 'provisional' };
    const replacementSpec: RowSpec = { id: 3, kind: 'replacement' };

    let rows!: State<RowSpec[]>;
    let retainedSetCount!: (value: number) => void;
    let retainedClicks = 0;
    let retainedCleanups = 0;
    let retainedAborts = 0;
    let retainedRefAttaches = 0;
    let retainedRefDetaches = 0;
    let provisionalCleanups = 0;
    let provisionalAborts = 0;
    const provisionalRefValues: Array<Element | null> = [];

    const retainedLoader = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            retainedAborts += 1;
          });
        })
    );
    const provisionalLoader = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            provisionalAborts += 1;
          });
        })
    );

    const retainedRef = (element: Element | null) => {
      if (element) {
        retainedRefAttaches += 1;
      } else {
        retainedRefDetaches += 1;
      }
    };

    function RetainedRow() {
      const count = state(0);
      retainedSetCount = count.set;
      resource(retainedLoader, []);
      task(() => () => {
        retainedCleanups += 1;
      });

      return (
        <>
          <button
            data-row={'retained'}
            ref={retainedRef}
            onClick={() => {
              retainedClicks += 1;
              count.set((value) => value + 1);
            }}
          >{`retained:${count()}`}</button>
          <Portal>
            <aside data-portal={'retained'}>{'retained portal'}</aside>
          </Portal>
        </>
      );
    }

    function ProvisionalRow() {
      resource(provisionalLoader, []);
      task(() => () => {
        provisionalCleanups += 1;
      });

      return (
        <>
          <Portal>
            <aside data-portal={'provisional'}>{'provisional portal'}</aside>
          </Portal>
          <button
            data-row={'provisional'}
            ref={(element) => {
              provisionalRefValues.push(element);
            }}
          >
            {'provisional'}
          </button>
          <ProvisionalFailure />
        </>
      );
    }

    function ProvisionalFailure(): never {
      throw new Error('provisional render failed');
    }

    function ReplacementRow() {
      return <button data-row={'replacement'}>{'replacement'}</button>;
    }

    function Row({ row }: { row: RowSpec }) {
      if (row.kind === 'retained') {
        return <RetainedRow />;
      }
      if (row.kind === 'provisional') {
        return <ProvisionalRow />;
      }
      return <ReplacementRow />;
    }

    function App() {
      rows = state<RowSpec[]>([retainedSpec]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => <Row row={row} />}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const retainedButton = container.querySelector(
      '[data-row="retained"]'
    ) as HTMLButtonElement;

    retainedButton.click();
    flushScheduler();

    expect(retainedButton.textContent).toBe('retained:1');
    expect(container.querySelector('[data-portal="retained"]')).not.toBeNull();
    expect(retainedLoader).toHaveBeenCalledTimes(1);
    expect(retainedRefAttaches).toBe(1);

    rows.set([failingSpec]);
    expect(() => flushScheduler()).toThrow('provisional render failed');
    await Promise.resolve();
    await Promise.resolve();

    expect
      .soft(container.querySelector('[data-row="retained"]'))
      .toBe(retainedButton);
    expect.soft(retainedCleanups).toBe(0);
    expect.soft(retainedAborts).toBe(0);
    expect.soft(retainedRefDetaches).toBe(0);
    expect.soft(provisionalLoader).not.toHaveBeenCalled();
    expect.soft(provisionalAborts).toBe(0);
    expect.soft(provisionalCleanups).toBe(0);
    expect.soft(provisionalRefValues).toEqual([]);
    expect
      .soft(container.querySelector('[data-portal="retained"]'))
      .not.toBeNull();
    expect
      .soft(container.querySelector('[data-portal="provisional"]'))
      .toBeNull();

    retainedButton.click();
    flushScheduler();
    expect.soft(retainedClicks).toBe(2);
    expect.soft(retainedButton.textContent).toBe('retained:2');

    retainedSetCount(3);
    flushScheduler();
    expect.soft(retainedButton.textContent).toBe('retained:3');

    rows.set([retainedSpec]);
    flushScheduler();
    expect
      .soft(container.querySelector('[data-row="retained"]'))
      .toBe(retainedButton);

    rows.set([replacementSpec]);
    flushScheduler();

    expect(container.querySelector('[data-row="replacement"]')).not.toBeNull();
    expect(container.querySelector('[data-row="retained"]')).toBeNull();
    expect(container.querySelector('[data-portal="retained"]')).toBeNull();
    expect(retainedCleanups).toBe(1);
    expect(retainedAborts).toBe(1);
    expect(retainedRefDetaches).toBe(1);
  });

  it('should dispose refs resources tasks and listeners exactly once after a full clear', async () => {
    type Row = { id: number };
    let rows!: State<Row[]>;
    let cleanups = 0;
    let aborts = 0;
    let detaches = 0;
    let clicks = 0;

    const loader = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            aborts += 1;
          });
        })
    );

    function RowView({ row }: { row: Row }) {
      resource(loader, []);
      task(() => () => {
        cleanups += 1;
      });

      return (
        <button
          data-row={String(row.id)}
          ref={(element) => {
            if (!element) {
              detaches += 1;
            }
          }}
          onClick={() => {
            clicks += 1;
          }}
        >
          {String(row.id)}
        </button>
      );
    }

    function App() {
      rows = state<Row[]>([{ id: 1 }, { id: 2 }]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => <RowView row={row} />}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const removedButtons = Array.from(
      container.querySelectorAll('button')
    ) as HTMLButtonElement[];
    expect(loader).toHaveBeenCalledTimes(2);

    rows.set([]);
    flushScheduler();

    expect(container.querySelector('[data-row]')).toBeNull();
    expect(cleanups).toBe(2);
    expect(aborts).toBe(2);
    expect(detaches).toBe(2);

    for (const button of removedButtons) {
      button.click();
    }
    expect(clicks).toBe(0);

    rows.set([]);
    flushScheduler();
    expect(cleanups).toBe(2);
    expect(aborts).toBe(2);
    expect(detaches).toBe(2);

    rows.set([{ id: 1 }]);
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('[data-row="1"]')).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
