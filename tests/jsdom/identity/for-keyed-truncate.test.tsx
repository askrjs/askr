import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { createIsland } from '../../../src/boot';
import { getCurrentComponentInstance } from '../../../src/runtime';
import { state, type State } from '../../../src/runtime/state';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Row = { id: number; label: string; broken?: boolean };

describe('keyed For truncation', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should retain row identity, state, listeners, and refs while cleaning removed rows once', () => {
    const initialRows: Row[] = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
      { id: 4, label: 'four' },
    ];
    let rows!: State<Row[]>;
    const cleanupCounts = new Map<number, number>();
    const refs = new Map<number, HTMLButtonElement>();
    const localSetters = new Map<number, (next: number) => void>();
    const frameworkClicks: number[] = [];

    function RowView({ row }: { row: Row }) {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected row component instance');
      const local = state(0);
      localSetters.set(row.id, local.set);
      (instance.ownership.cleanups ??= []).push(() => {
        cleanupCounts.set(row.id, (cleanupCounts.get(row.id) ?? 0) + 1);
      });

      return (
        <button
          data-row={String(row.id)}
          ref={(element: HTMLButtonElement | null) => {
            if (element) refs.set(row.id, element);
            else refs.delete(row.id);
          }}
          onClick={() => {
            frameworkClicks.push(row.id);
            local.set((value) => value + 1);
          }}
        >{`${row.label}:${local()}`}</button>
      );
    }

    function App() {
      rows = state(initialRows);
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

    const retained = container.querySelector(
      '[data-row="2"]'
    ) as HTMLButtonElement;
    const retainedRef = refs.get(2);
    let nativeClicks = 0;
    retained.addEventListener('click', () => nativeClicks++);
    retained.click();
    flushScheduler();
    expect(retained.textContent).toBe('two:1');

    rows.set(initialRows.slice(0, 2));
    flushScheduler();

    expect(container.querySelector('[data-row="2"]')).toBe(retained);
    expect(refs.get(2)).toBe(retainedRef);
    expect(retained.textContent).toBe('two:1');
    expect(cleanupCounts.get(1) ?? 0).toBe(0);
    expect(cleanupCounts.get(2) ?? 0).toBe(0);
    expect(cleanupCounts.get(3)).toBe(1);
    expect(cleanupCounts.get(4)).toBe(1);
    expect(refs.has(3)).toBe(false);
    expect(refs.has(4)).toBe(false);

    retained.click();
    flushScheduler();
    expect(nativeClicks).toBe(2);
    expect(frameworkClicks).toEqual([2, 2]);
    expect(retained.textContent).toBe('two:2');

    localSetters.get(3)?.(1);
    flushScheduler();
    expect(container.querySelector('[data-row="3"]')).toBeNull();
    expect(cleanupCounts.get(3)).toBe(1);
  });

  it('should roll back a failed retained update and allow truncation to retry', () => {
    const initialRows: Row[] = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
      { id: 4, label: 'four' },
    ];
    let rows!: State<Row[]>;
    const cleanupCounts = new Map<number, number>();

    function RowView({ row }: { row: Row }) {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected row component instance');
      if (row.broken) throw new Error('retained truncate update failed');
      (instance.ownership.cleanups ??= []).push(() => {
        cleanupCounts.set(row.id, (cleanupCounts.get(row.id) ?? 0) + 1);
      });
      return <button data-row={String(row.id)}>{row.label}</button>;
    }

    function App() {
      rows = state(initialRows);
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
    const originalNodes = Array.from(container.querySelectorAll('[data-row]'));

    rows.set([
      { id: 1, label: 'one changed' },
      { id: 2, label: 'two', broken: true },
    ]);
    expect(() => flushScheduler()).toThrow('retained truncate update failed');

    expect(Array.from(container.querySelectorAll('[data-row]'))).toEqual(
      originalNodes
    );
    expect(originalNodes.map((node) => node.textContent)).toEqual([
      'one',
      'two',
      'three',
      'four',
    ]);
    expect(cleanupCounts.size).toBe(0);

    rows.set([
      { id: 1, label: 'one changed' },
      { id: 2, label: 'two' },
    ]);
    flushScheduler();

    const retainedNodes = Array.from(container.querySelectorAll('[data-row]'));
    expect(retainedNodes).toEqual(originalNodes.slice(0, 2));
    expect(retainedNodes.map((node) => node.textContent)).toEqual([
      'one changed',
      'two',
    ]);
    expect(cleanupCounts.get(1) ?? 0).toBe(0);
    expect(cleanupCounts.get(2) ?? 0).toBe(0);
    expect(cleanupCounts.get(3)).toBe(1);
    expect(cleanupCounts.get(4)).toBe(1);
  });
});
