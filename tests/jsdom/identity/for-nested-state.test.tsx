import { expect } from 'vite-plus/test';
import { test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';
import { DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT } from '../../../src/renderer/utils';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/runtime/events';

test('should update item locally when nested state changes without rerendering the parent', () => {
  const { container, cleanup } = createTestContainer();
  let parentRenderCount = 0;

  const Component = () => {
    parentRenderCount += 1;
    const rows = [1];
    return (
      <div>
        {
          <For each={() => rows} by={(_, index) => index}>
            {(_n) => {
              const c = state(0);
              return (
                <button onClick={() => c.set(c() + 1)}>{String(c())}</button>
              );
            }}
          </For>
        }
      </div>
    );
  };

  createIsland({ root: container, component: Component });

  const btn = container.querySelector('button') as HTMLButtonElement;
  expect(btn.textContent).to.equal('0');
  expect(parentRenderCount).to.equal(1);

  btn.click();
  flushScheduler();

  const btnAfter = container.querySelector('button') as HTMLButtonElement;
  expect(btnAfter).to.equal(btn);
  expect(btnAfter.textContent).to.equal('1');
  expect(parentRenderCount).to.equal(1);

  cleanup();
});

test('should update fallback locally when nested state changes without rerendering the parent', () => {
  const { container, cleanup } = createTestContainer();
  let parentRenderCount = 0;

  const FallbackCounter = () => {
    const clicks = state(0);

    return (
      <button onClick={() => clicks.set((value) => value + 1)}>
        {`fallback:${clicks()}`}
      </button>
    );
  };

  const Component = () => {
    parentRenderCount += 1;
    const rows: number[] = [];

    return (
      <div>
        <For
          each={() => rows}
          by={(_, index) => index}
          fallback={<FallbackCounter />}
        >
          {(row) => <div>{String(row)}</div>}
        </For>
      </div>
    );
  };

  createIsland({ root: container, component: Component });

  const button = container.querySelector('button') as HTMLButtonElement;
  expect(button.textContent).to.equal('fallback:0');
  expect(parentRenderCount).to.equal(1);

  button.click();
  flushScheduler();

  const buttonAfter = container.querySelector('button') as HTMLButtonElement;
  expect(buttonAfter).to.equal(button);
  expect(buttonAfter.textContent).to.equal('fallback:1');
  expect(parentRenderCount).to.equal(1);

  cleanup();
});

test('should preserve DOM identity when nested state changes without list reorder', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [1, 2, 3];
    return (
      <div>
        {
          <For each={() => rows} by={(row) => row}>
            {(row) => {
              const count = state(0);
              return (
                <button
                  data-row={String(row)}
                  onClick={() => count.set(count() + 1)}
                >
                  {`${row}:${count()}`}
                </button>
              );
            }}
          </For>
        }
      </div>
    );
  };

  createIsland({ root: container, component: Component });

  const row1Before = container.querySelector('[data-row="1"]');
  const row2Before = container.querySelector('[data-row="2"]');
  const row3Before = container.querySelector('[data-row="3"]');

  expect(row1Before?.textContent).to.equal('1:0');
  expect(row2Before?.textContent).to.equal('2:0');
  expect(row3Before?.textContent).to.equal('3:0');

  (row2Before as HTMLButtonElement).click();
  flushScheduler();

  const row1After = container.querySelector('[data-row="1"]');
  const row2After = container.querySelector('[data-row="2"]');
  const row3After = container.querySelector('[data-row="3"]');

  expect(row1After).to.equal(row1Before);
  expect(row2After).to.equal(row2Before);
  expect(row3After).to.equal(row3Before);
  expect(row2After?.textContent).to.equal('2:1');

  cleanup();
});

test('should preserve For row identity, local state, and listeners during move-only reorders', () => {
  const { container, cleanup } = createTestContainer();

  let rowsState!: ReturnType<
    typeof state<Array<{ id: number; label: string }>>
  >;
  const frameworkClicks: number[] = [];
  const rowRenderCounts = new Map<number, number>();

  const Row = ({ item }: { item: { id: number; label: string } }) => {
    rowRenderCounts.set(item.id, (rowRenderCounts.get(item.id) ?? 0) + 1);
    const local = state(0);

    return (
      <button
        data-row={String(item.id)}
        onClick={() => {
          frameworkClicks.push(item.id);
          local.set((value) => value + 1);
        }}
      >
        {() => `${item.label}:${local()}`}
      </button>
    );
  };

  const initialRows = Array.from({ length: 128 }, (_, i) => ({
    id: i + 1,
    label: `Item ${i + 1}`,
  }));

  const Component = () => {
    rowsState = state(initialRows);

    return (
      <div>
        <For each={rowsState} by={(row) => row.id}>
          {(row) => <Row item={row} />}
        </For>
      </div>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  const idToCheck = 10;
  const beforeElem = container.querySelector(
    `[data-row="${idToCheck}"]`
  ) as HTMLButtonElement;
  let nativeClicks = 0;
  beforeElem.addEventListener('click', () => {
    nativeClicks++;
  });

  beforeElem.click();
  flushScheduler();

  expect(beforeElem.textContent).to.equal('Item 10:1');
  expect(nativeClicks).to.equal(1);
  expect(frameworkClicks).to.deep.equal([10]);
  expect(rowRenderCounts.get(idToCheck)).to.equal(1);

  rowsState.set([...rowsState()].reverse());
  flushScheduler();

  const afterElem = container.querySelector(
    `[data-row="${idToCheck}"]`
  ) as HTMLButtonElement;
  expect(afterElem).to.equal(beforeElem);
  expect(afterElem.textContent).to.equal('Item 10:1');
  expect(rowRenderCounts.get(idToCheck)).to.equal(1);

  afterElem.click();
  flushScheduler();

  expect(afterElem.textContent).to.equal('Item 10:2');
  expect(nativeClicks).to.equal(2);
  expect(frameworkClicks).to.deep.equal([10, 10]);

  const rowElements = Array.from(container.querySelectorAll('[data-row]'));
  expect(rowElements[0]?.getAttribute('data-row')).to.equal('128');
  expect(
    rowElements[rowElements.length - 1]?.getAttribute('data-row')
  ).to.equal('1');

  cleanup();
});

test('should update only dirty For rows during no-reorder commits', () => {
  const { container, cleanup } = createTestContainer();

  let rowsState!: ReturnType<
    typeof state<Array<{ id: number; label: string }>>
  >;
  const rowRenderCounts = new Map<number, number>();
  const frameworkClicks: number[] = [];

  const Row = ({ item }: { item: { id: number; label: string } }) => {
    rowRenderCounts.set(item.id, (rowRenderCounts.get(item.id) ?? 0) + 1);

    return (
      <button
        data-row={String(item.id)}
        onClick={() => frameworkClicks.push(item.id)}
      >
        {item.label}
      </button>
    );
  };

  const Component = () => {
    rowsState = state([
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
      { id: 3, label: 'gamma' },
      { id: 4, label: 'delta' },
    ]);

    return (
      <div>
        <For each={rowsState} by={(row) => row.id}>
          {(row) => <Row item={row} />}
        </For>
      </div>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  const beforeRows = new Map(
    Array.from(container.querySelectorAll('[data-row]'), (row) => [
      Number(row.getAttribute('data-row')),
      row,
    ])
  );
  const cleanRow = beforeRows.get(3) as HTMLButtonElement;
  let nativeClicks = 0;
  cleanRow.addEventListener('click', () => {
    nativeClicks++;
  });

  rowsState.set([
    { id: 1, label: 'alpha' },
    { id: 2, label: 'beta!' },
    { id: 3, label: 'gamma' },
    { id: 4, label: 'delta' },
  ]);
  flushScheduler();

  for (const [id, beforeRow] of beforeRows) {
    expect(container.querySelector(`[data-row="${id}"]`)).to.equal(beforeRow);
  }

  expect(container.querySelector('[data-row="2"]')?.textContent).to.equal(
    'beta!'
  );
  expect(rowRenderCounts.get(1)).to.equal(1);
  expect(rowRenderCounts.get(2)).to.equal(2);
  expect(rowRenderCounts.get(3)).to.equal(1);
  expect(rowRenderCounts.get(4)).to.equal(1);

  cleanRow.click();
  flushScheduler();

  expect(nativeClicks).to.equal(1);
  expect(frameworkClicks).to.deep.equal([3]);

  cleanup();
});

test('should clean removed For row listeners without cleaning retained rows', () => {
  const { container, cleanup } = createTestContainer();
  disableEventDelegation();

  try {
    let rowsState!: ReturnType<typeof state<number[]>>;
    const frameworkClicks: number[] = [];
    const rowSetters = new Map<number, (next: number) => void>();

    const Row = ({ id }: { id: number }) => {
      const local = state(0);
      rowSetters.set(id, local.set);

      return (
        <button
          data-row={String(id)}
          onClick={() => {
            frameworkClicks.push(id);
            local.set((value) => value + 1);
          }}
        >
          {() => `${id}:${local()}`}
        </button>
      );
    };

    const Component = () => {
      rowsState = state([1, 2, 3]);

      return (
        <div>
          <For each={rowsState} by={(row) => row}>
            {(row) => <Row id={row} />}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const removedRow = container.querySelector(
      '[data-row="2"]'
    ) as HTMLButtonElement;
    const retainedRow = container.querySelector(
      '[data-row="3"]'
    ) as HTMLButtonElement;

    rowsState.set([3, 1]);
    flushScheduler();

    const retainedAfter = container.querySelector(
      '[data-row="3"]'
    ) as HTMLButtonElement;
    expect(retainedAfter).to.equal(retainedRow);
    expect(container.querySelector('[data-row="2"]')).to.equal(null);

    removedRow.click();
    retainedAfter.click();
    flushScheduler();

    expect(frameworkClicks).to.deep.equal([3]);

    rowSetters.get(2)!(1);
    rowSetters.get(3)!(2);
    flushScheduler();

    expect(removedRow.textContent).to.equal('2:0');
    expect(retainedAfter.textContent).to.equal('3:2');
  } finally {
    enableEventDelegation();
    cleanup();
  }
});

test('should keep For keyed behavior correct across append truncate swap and full-keyed commits', () => {
  const { container, cleanup } = createTestContainer();

  let rowsState!: ReturnType<
    typeof state<Array<{ id: number; label: string }>>
  >;

  const Component = () => {
    rowsState = state([
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
    ]);

    return (
      <section>
        <For each={rowsState} by={(row) => row.id}>
          {(row) => <article data-row={String(row.id)}>{row.label}</article>}
        </For>
      </section>
    );
  };

  const order = () =>
    Array.from(container.querySelectorAll('[data-row]'), (row) =>
      row.getAttribute('data-row')
    );

  createIsland({ root: container, component: Component });
  flushScheduler();

  const row1 = container.querySelector('[data-row="1"]');
  const row2 = container.querySelector('[data-row="2"]');
  const row3 = container.querySelector('[data-row="3"]');

  rowsState.set([
    { id: 1, label: 'one' },
    { id: 2, label: 'two' },
    { id: 3, label: 'three' },
    { id: 4, label: 'four' },
  ]);
  flushScheduler();

  const row4 = container.querySelector('[data-row="4"]');
  expect(order()).to.deep.equal(['1', '2', '3', '4']);
  expect(container.querySelector('[data-row="1"]')).to.equal(row1);
  expect(container.querySelector('[data-row="2"]')).to.equal(row2);
  expect(container.querySelector('[data-row="3"]')).to.equal(row3);

  rowsState.set([
    { id: 1, label: 'one' },
    { id: 3, label: 'three' },
    { id: 2, label: 'two' },
    { id: 4, label: 'four' },
  ]);
  flushScheduler();

  expect(order()).to.deep.equal(['1', '3', '2', '4']);
  expect(container.querySelector('[data-row="2"]')).to.equal(row2);
  expect(container.querySelector('[data-row="3"]')).to.equal(row3);

  rowsState.set([
    { id: 1, label: 'one' },
    { id: 3, label: 'three' },
  ]);
  flushScheduler();

  expect(order()).to.deep.equal(['1', '3']);
  expect(container.querySelector('[data-row="1"]')).to.equal(row1);
  expect(container.querySelector('[data-row="3"]')).to.equal(row3);
  expect(container.querySelector('[data-row="2"]')).to.equal(null);
  expect(container.querySelector('[data-row="4"]')).to.equal(null);

  rowsState.set([
    { id: 5, label: 'five' },
    { id: 3, label: 'three!' },
    { id: 1, label: 'one!' },
  ]);
  flushScheduler();

  expect(order()).to.deep.equal(['5', '3', '1']);
  expect(container.querySelector('[data-row="3"]')).to.equal(row3);
  expect(container.querySelector('[data-row="1"]')).to.equal(row1);
  expect(container.querySelector('[data-row="4"]')).to.not.equal(row4);
  expect(container.querySelector('[data-row="3"]')?.textContent).to.equal(
    'three!'
  );
  expect(container.querySelector('[data-row="1"]')?.textContent).to.equal(
    'one!'
  );

  cleanup();
});

test('should use the fragment path above the For direct spread threshold', () => {
  const { container, cleanup } = createTestContainer();
  const count = DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT + 1;
  let rowsState!: ReturnType<
    typeof state<Array<{ id: number; label: string }>>
  >;

  const Component = () => {
    rowsState = state(
      Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        label: `Item ${index + 1}`,
      }))
    );

    return (
      <section>
        <For each={rowsState} by={(row) => row.id}>
          {(row) => <div data-row={String(row.id)}>{row.label}</div>}
        </For>
      </section>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  const idToCheck = 1024;
  const beforeElem = container.querySelector(
    `[data-row="${idToCheck}"]`
  ) as HTMLElement;
  const parent = container.querySelector('section') as HTMLElement;
  const replaceSpy = vi.spyOn(parent, 'replaceChildren');

  rowsState.set([...rowsState()].reverse());
  flushScheduler();

  expect(replaceSpy).toHaveBeenCalled();
  const replaceCall = replaceSpy.mock.calls.at(-1)!;
  expect(replaceCall.length).to.equal(1);
  expect(replaceCall[0]).to.be.instanceOf(DocumentFragment);

  const afterElem = container.querySelector(
    `[data-row="${idToCheck}"]`
  ) as HTMLElement;
  expect(afterElem).to.equal(beforeElem);
  expect(parent.firstElementChild?.getAttribute('data-row')).to.equal(
    String(count)
  );
  expect(parent.lastElementChild?.getAttribute('data-row')).to.equal('1');

  replaceSpy.mockRestore();
  cleanup();
});

test('should stop removed row scopes from enqueueing parent rerenders', () => {
  const { container, cleanup } = createTestContainer();

  let rowsState!: ReturnType<typeof state<number[]>>;
  const rowSetters = new Map<number, (next: number) => void>();
  let parentRenderCount = 0;

  const Component = () => {
    parentRenderCount++;
    rowsState = state([1, 2]);

    return (
      <div>
        {
          <For each={rowsState} by={(row) => row}>
            {(row) => {
              const local = state(0);
              rowSetters.set(row, local.set);

              return (
                <button data-row={String(row)}>{`${row}:${local()}`}</button>
              );
            }}
          </For>
        }
      </div>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  rowsState.set([1]);
  flushScheduler();

  const renderCountAfterRemoval = parentRenderCount;
  const removedRowSetter = rowSetters.get(2);

  expect(removedRowSetter).to.be.a('function');
  expect(container.querySelector('[data-row="2"]')).to.equal(null);

  removedRowSetter!(1);
  flushScheduler();

  expect(parentRenderCount).to.equal(renderCountAfterRemoval);
  expect(container.querySelector('[data-row="2"]')).to.equal(null);

  cleanup();
});

test('should update list source without rerendering the parent component', () => {
  const { container, cleanup } = createTestContainer();

  let rowsState!: ReturnType<
    typeof state<Array<{ id: number; label: string }>>
  >;
  let parentRenderCount = 0;

  const Component = () => {
    parentRenderCount += 1;
    rowsState = state([
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
    ]);

    return (
      <ul>
        <For each={() => rowsState()} by={(row) => row.id}>
          {(row) => <li data-row={String(row.id)}>{row.label}</li>}
        </For>
      </ul>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  expect(parentRenderCount).to.equal(1);
  expect(container.querySelector('[data-row="1"]')?.textContent).to.equal(
    'alpha'
  );
  expect(container.querySelector('[data-row="2"]')?.textContent).to.equal(
    'beta'
  );

  rowsState.set([
    { id: 1, label: 'alpha!' },
    { id: 2, label: 'beta' },
  ]);
  flushScheduler();

  expect(parentRenderCount).to.equal(1);
  expect(container.querySelector('[data-row="1"]')?.textContent).to.equal(
    'alpha!'
  );
  expect(container.querySelector('[data-row="2"]')?.textContent).to.equal(
    'beta'
  );

  cleanup();
});
