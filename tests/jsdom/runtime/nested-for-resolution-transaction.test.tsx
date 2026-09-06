import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('single-output nested For resolution', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should clear transaction metadata across repeated keyed resolutions', () => {
    type Row = { id: number; label: string };
    let rows!: State<Row[]>;

    function App() {
      rows = state<Row[]>([{ id: 1, label: 'one' }]);
      return (
        <main>
          {[
            <span key={'static'} data-static={'true'}>
              {'static'}
            </span>,
            <For each={rows} by={(row) => row.id}>
              {(row) => <button data-row={String(row.id)}>{row.label}</button>}
            </For>,
          ]}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    const firstRow = container.querySelector('[data-row="1"]');

    rows.set([{ id: 1, label: 'one!' }]);
    flushScheduler();
    expect(container.querySelector('[data-row="1"]')).toBe(firstRow);
    expect(firstRow?.textContent).toBe('one!');

    rows.set([{ id: 1, label: 'one!!' }]);
    flushScheduler();
    expect(container.querySelector('[data-row="1"]')).toBe(firstRow);
    expect(firstRow?.textContent).toBe('one!!');

    rows.set([{ id: 2, label: 'two' }]);
    flushScheduler();
    expect(container.querySelector('[data-row="1"]')).toBeNull();
    expect(container.querySelector('[data-row="2"]')?.textContent).toBe('two');
    expect(container.querySelector('[data-static]')?.textContent).toBe(
      'static'
    );
  });
});
