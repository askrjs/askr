import { expect } from 'chai';
import { test } from 'vite-plus/test';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should update item when nested state changes', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
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

  btn.click();
  flushScheduler();

  // Re-query the button since the parent re-render creates new DOM elements
  const btnAfter = container.querySelector('button') as HTMLButtonElement;
  expect(btnAfter.textContent).to.equal('1');

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
