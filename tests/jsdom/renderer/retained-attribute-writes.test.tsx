import { expect, test } from 'vite-plus/test';
import { For, state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

test('should retain list attributes without rewriting them while updating row callbacks', () => {
  const { container, cleanup } = createTestContainer();
  let rows!: State<Array<{ id: number; revision: number }>>;
  const renders: number[] = [];
  const clicks: number[] = [];
  function Row({ row }: { row: { id: number; revision: number } }) {
    renders.push(row.revision);
    return (
      <button
        class="row fixed"
        title="unchanged"
        data-row={row.id}
        aria-label="Select row"
        onClick={() => clicks.push(row.revision)}
      >
        Row
      </button>
    );
  }
  function App() {
    rows = state([{ id: 1, revision: 0 }]);
    return (
      <div>
        <For each={() => rows()} by={(row) => row.id}>
          {(row) => <Row row={row} />}
        </For>
      </div>
    );
  }
  const observer = new MutationObserver(() => {});
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const button = container.querySelector('button')!;
    observer.observe(button, { attributes: true });
    rows.set([{ id: 1, revision: 1 }]);
    flushScheduler();
    expect(container.querySelector('button')).toBe(button);
    expect(renders).toEqual([0, 1]);
    button.click();
    expect(clicks).toEqual([1]);
    expect(
      observer.takeRecords().map((record) => record.attributeName)
    ).toEqual([]);
  } finally {
    observer.disconnect();
    cleanup();
  }
});

test.each(['html', 'svg'])(
  'should preserve empty %s class attribute semantics',
  (kind) => {
    const { container, cleanup } = createTestContainer();
    let cls!: State<string>;
    try {
      createIsland({
        root: container,
        component: () => {
          cls = state('');
          return kind === 'svg' ? <svg class={cls()} /> : <div class={cls()} />;
        },
      });
      flushScheduler();
      const element = container.firstElementChild!;
      expect(element.getAttribute('class')).toBe(kind === 'svg' ? null : '');
      cls.set('a');
      flushScheduler();
      cls.set('');
      flushScheduler();
      expect(element.getAttribute('class')).toBe(kind === 'svg' ? null : '');
    } finally {
      cleanup();
    }
  }
);
