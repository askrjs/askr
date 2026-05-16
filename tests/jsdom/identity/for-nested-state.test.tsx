import { expect } from 'vite-plus/test';
import { test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

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
