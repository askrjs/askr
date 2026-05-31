import { expect, test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

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
}, 15000);
