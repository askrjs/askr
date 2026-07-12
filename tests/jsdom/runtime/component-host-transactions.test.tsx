import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { For } from '../../../src/control';
import { getSignal, resource, task } from '../../../src/resources';
import { state, type State } from '../../../src/runtime/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Row = {
  id: number;
  kind: 'a' | 'b' | 'stable' | 'broken';
};

describe('component host transactions', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve a same-host owner on sibling failure and clean it once on recovery', async () => {
    let rows!: State<Row[]>;
    let retainedState!: State<number>;
    let retainedClicks = 0;
    let replacementClicks = 0;
    let retainedCleanups = 0;
    let retainedOwnerAborts = 0;
    let retainedResourceAborts = 0;
    let retainedRefDetaches = 0;
    const replacementOwnerSignals: AbortSignal[] = [];
    const replacementRefValues: Array<Element | null> = [];

    const retainedLoader = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            retainedResourceAborts += 1;
          });
        })
    );
    const replacementLoader = vi.fn(() => new Promise<string>(() => undefined));
    const retainedRef = (element: Element | null) => {
      if (!element) {
        retainedRefDetaches += 1;
      }
    };
    const replacementRef = (element: Element | null) => {
      replacementRefValues.push(element);
    };

    function RetainedRow() {
      const count = state(0);
      retainedState = count;
      const ownerSignal = getSignal();
      if (!ownerSignal.onabort) {
        ownerSignal.onabort = () => {
          retainedOwnerAborts += 1;
        };
      }
      resource(retainedLoader, []);
      task(() => () => {
        retainedCleanups += 1;
      });

      return (
        <button
          data-owner={'a'}
          ref={retainedRef}
          onClick={() => {
            retainedClicks += 1;
            count.set((value) => value + 1);
          }}
        >{`a:${count()}`}</button>
      );
    }

    function ReplacementRow() {
      const ownerSignal = getSignal();
      if (!replacementOwnerSignals.includes(ownerSignal)) {
        replacementOwnerSignals.push(ownerSignal);
      }
      resource(replacementLoader, []);

      return (
        <button
          data-owner={'b'}
          ref={replacementRef}
          onClick={() => {
            replacementClicks += 1;
          }}
        >
          {'b'}
        </button>
      );
    }

    function LaterRow({ row }: { row: Row }) {
      if (row.kind === 'broken') {
        throw new Error('later same-host row failed');
      }
      return <span data-later={'stable'}>{'stable'}</span>;
    }

    function App() {
      rows = state<Row[]>([
        { id: 1, kind: 'a' },
        { id: 2, kind: 'stable' },
      ]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) =>
              row.id === 1 ? (
                row.kind === 'a' ? (
                  <RetainedRow />
                ) : (
                  <ReplacementRow />
                )
              ) : (
                <LaterRow row={row} />
              )
            }
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const retainedButton = container.querySelector(
      '[data-owner="a"]'
    ) as HTMLButtonElement;
    retainedButton.click();
    flushScheduler();
    expect(retainedButton.textContent).toBe('a:1');
    expect(retainedLoader).toHaveBeenCalledTimes(1);

    rows.set([
      { id: 1, kind: 'b' },
      { id: 2, kind: 'broken' },
    ]);
    expect(() => flushScheduler()).toThrow('later same-host row failed');

    expect(container.querySelector('[data-owner="a"]')).toBe(retainedButton);
    expect(container.querySelector('[data-owner="b"]')).toBeNull();
    expect(retainedButton.textContent).toBe('a:1');
    expect(retainedCleanups).toBe(0);
    expect(retainedOwnerAborts).toBe(0);
    expect(retainedResourceAborts).toBe(0);
    expect(retainedRefDetaches).toBe(0);
    expect(replacementLoader).not.toHaveBeenCalled();
    expect(replacementRefValues).toEqual([]);
    expect(replacementOwnerSignals).toHaveLength(1);
    expect(replacementOwnerSignals[0]!.aborted).toBe(true);

    retainedButton.click();
    flushScheduler();
    expect(retainedClicks).toBe(2);
    expect(retainedButton.textContent).toBe('a:2');

    rows.set([
      { id: 1, kind: 'b' },
      { id: 2, kind: 'stable' },
    ]);
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const replacementButton = container.querySelector(
      '[data-owner="b"]'
    ) as HTMLButtonElement;
    expect(replacementButton).toBe(retainedButton);
    expect(retainedCleanups).toBe(1);
    expect(retainedOwnerAborts).toBe(1);
    expect(retainedResourceAborts).toBe(1);
    expect(retainedRefDetaches).toBe(1);
    expect(replacementLoader).toHaveBeenCalledTimes(1);
    expect(replacementRefValues).toEqual([replacementButton]);
    expect(replacementOwnerSignals).toHaveLength(2);
    expect(replacementOwnerSignals[1]!.aborted).toBe(false);

    replacementButton.click();
    flushScheduler();
    expect(replacementClicks).toBe(1);
    expect(retainedClicks).toBe(2);

    retainedState.set(99);
    flushScheduler();
    expect(replacementButton.textContent).toBe('b');
    expect(retainedCleanups).toBe(1);
  });

  it.each(['callback', 'object'] as const)(
    'should detach a shared %s ref before attaching a replacement root',
    (refKind) => {
      let replaceRoot!: State<boolean>;
      const values: Array<Element | null> = [];
      let objectValue: Element | null = null;
      const sharedRef =
        refKind === 'callback'
          ? (value: Element | null) => {
              values.push(value);
            }
          : Object.defineProperty({}, 'current', {
              configurable: true,
              get: () => objectValue,
              set: (value: Element | null) => {
                objectValue = value;
                values.push(value);
              },
            });

      function Child({ article }: { article: boolean }) {
        return article ? (
          <article ref={sharedRef}>{'new'}</article>
        ) : (
          <button ref={sharedRef}>{'old'}</button>
        );
      }

      function App() {
        replaceRoot = state(false);
        return (
          <div>
            <Child article={replaceRoot()} />
          </div>
        );
      }

      createIsland({ root: container, component: App });
      flushScheduler();
      const oldRoot = container.querySelector('button')!;
      expect(values).toEqual([oldRoot]);

      replaceRoot.set(true);
      flushScheduler();

      const newRoot = container.querySelector('article')!;
      expect(values).toEqual([oldRoot, null, newRoot]);
      if (refKind === 'object') {
        expect(objectValue).toBe(newRoot);
      }
    }
  );
});
