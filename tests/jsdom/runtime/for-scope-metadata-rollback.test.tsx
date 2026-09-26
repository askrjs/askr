import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { For } from '../../../src/control';
import { defineScope, readScope } from '../../../src/runtime/context/context';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('For scope metadata rollback', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should restore a dirty retained scope when a later row commit fails', () => {
    type Phase = 'initial' | 'broken' | 'recovered';
    type Row = { id: number };

    let phase!: State<Phase>;

    function BrokenRow(): never {
      throw new Error('later row failed');
    }

    function App() {
      phase = state<Phase>('initial');
      const rows = state<Row[]>([{ id: 1 }, { id: 2 }]);

      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => {
              const currentPhase = phase();
              if (currentPhase === 'broken') {
                return row.id === 1 ? (
                  <section data-row={'1'}>{'provisional'}</section>
                ) : (
                  <BrokenRow />
                );
              }

              return (
                <button data-row={String(row.id)}>
                  {`${row.id}:${currentPhase}`}
                </button>
              );
            }}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const firstRow = container.querySelector('[data-row="1"]');
    const secondRow = container.querySelector('[data-row="2"]');

    phase.set('broken');
    expect(() => flushScheduler()).toThrow('later row failed');
    expect(container.querySelector('[data-row="1"]')).toBe(firstRow);
    expect(container.querySelector('[data-row="2"]')).toBe(secondRow);

    phase.set('recovered');
    flushScheduler();

    expect(container.querySelector('[data-row="1"]')).toBe(firstRow);
    expect(container.querySelector('[data-row="2"]')).toBe(secondRow);
    expect(container.querySelectorAll('[data-row]')).toHaveLength(2);
    expect(firstRow?.textContent).toBe('1:recovered');
    expect(secondRow?.textContent).toBe('2:recovered');
  });

  it('should restore the primitive item render closure after rollback', () => {
    let rows!: State<number[]>;
    let pulse!: State<number>;

    function BrokenRow(): never {
      throw new Error('primitive sibling failed');
    }

    function App() {
      rows = state([1, 2]);
      pulse = state(0);

      return (
        <main>
          <For each={rows} byIndex>
            {(value, index) => {
              const currentPulse = pulse();
              if (value === 99) {
                return <BrokenRow />;
              }

              return (
                <span data-row={String(index())}>
                  {`${value}:${currentPulse}`}
                </span>
              );
            }}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const firstRow = container.querySelector('[data-row="0"]');
    const secondRow = container.querySelector('[data-row="1"]');

    rows.set([10, 99]);
    expect(() => flushScheduler()).toThrow('primitive sibling failed');

    pulse.set(1);
    expect(() => flushScheduler()).not.toThrow();

    expect(container.querySelector('[data-row="0"]')).toBe(firstRow);
    expect(container.querySelector('[data-row="1"]')).toBe(secondRow);
    expect(firstRow?.textContent).toBe('1:1');
    expect(secondRow?.textContent).toBe('2:1');
  });

  it('should restore unread item indices after a failed removal', () => {
    type Phase = 'initial' | 'broken';

    let phase!: State<Phase>;
    let rows!: State<number[]>;
    const indices = new Map<number, () => number>();

    function LaterSibling({ broken }: { broken: boolean }) {
      if (broken) {
        throw new Error('removal sibling failed');
      }
      return <aside>{'later'}</aside>;
    }

    function App() {
      phase = state<Phase>('initial');
      rows = state([1, 2, 3]);
      const currentPhase = phase();

      return (
        <main>
          <For each={rows} by={(value) => value}>
            {(value, index) => {
              indices.set(value, index);
              return <span data-row={String(value)}>{String(value)}</span>;
            }}
          </For>
          <LaterSibling broken={currentPhase === 'broken'} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    rows.set([2, 3]);
    phase.set('broken');
    expect(() => flushScheduler()).toThrow('removal sibling failed');

    expect(indices.get(1)?.()).toBe(0);
    expect(indices.get(2)?.()).toBe(1);
    expect(indices.get(3)?.()).toBe(2);
    expect(container.querySelectorAll('[data-row]')).toHaveLength(3);
  });

  it('should restore an existing fallback scope after a later host failure', () => {
    type Phase = 'initial' | 'broken' | 'recovered';

    let phase!: State<Phase>;

    function LaterSibling({ broken }: { broken: boolean }) {
      if (broken) {
        throw new Error('later sibling failed');
      }
      return <aside data-later={'true'}>{'later'}</aside>;
    }

    function App() {
      phase = state<Phase>('initial');
      const currentPhase = phase();
      const rows = state<number[]>([]);

      return (
        <main>
          {[
            <section key={'boundary'} data-boundary={'true'}>
              <For
                each={rows}
                by={(value) => value}
                fallback={
                  currentPhase === 'broken' ? (
                    <section data-fallback={'true'}>{'provisional'}</section>
                  ) : (
                    <button data-fallback={'true'}>{currentPhase}</button>
                  )
                }
              >
                {(value) => <span>{String(value)}</span>}
              </For>
            </section>,
            <LaterSibling key={'later'} broken={currentPhase === 'broken'} />,
          ]}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-boundary]')!;
    const fallback = container.querySelector('[data-fallback]');
    const replaceSpy = vi.spyOn(host, 'replaceChild');

    phase.set('broken');
    expect(() => flushScheduler()).toThrow('later sibling failed');
    expect(replaceSpy).toHaveBeenCalled();
    const provisionalFallback = replaceSpy.mock.calls[0]![0];
    expect(provisionalFallback).toBeInstanceOf(HTMLElement);
    expect((provisionalFallback as Element).tagName).toBe('SECTION');
    expect(container.querySelector('[data-fallback]')).toBe(fallback);
    expect(fallback?.tagName).toBe('BUTTON');

    phase.set('recovered');
    flushScheduler();

    expect(container.querySelector('[data-fallback]')).toBe(fallback);
    expect(fallback?.textContent).toBe('recovered');
    expect(container.querySelectorAll('[data-fallback]')).toHaveLength(1);

    replaceSpy.mockRestore();
  });

  it('should keep a context change pending when the commit that applied it fails', () => {
    type Row = { id: string; label: string; broken?: boolean };
    const ThemeScope = defineScope('t0');

    let theme!: State<string>;
    let rows!: State<Row[]>;

    function BrokenRow(): never {
      throw new Error('row failed');
    }

    function Reader({ label }: { label: string }) {
      return <li>{`${label}:${readScope(ThemeScope)}`}</li>;
    }

    const renderRow = (row: Row) =>
      row.broken ? <BrokenRow /> : <Reader label={row.label} />;

    function App() {
      theme = state('t0');
      rows = state<Row[]>([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);

      return (
        <ThemeScope value={theme()}>
          <ul>
            <For each={rows} by={(row) => row.id}>
              {renderRow}
            </For>
          </ul>
        </ThemeScope>
      );
    }

    const texts = () =>
      Array.from(container.querySelectorAll('li')).map((li) => li.textContent);

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(texts()).toEqual(['A:t0', 'B:t0', 'C:t0']);
    const [a, , c] = rows();

    theme.set('t1');
    rows.set([a!, { id: 'b', label: 'B', broken: true }, c!]);
    expect(() => flushScheduler()).toThrow('row failed');

    rows.set([a!, { id: 'b', label: 'B2' }, c!]);
    flushScheduler();

    expect(texts()).toEqual(['A:t1', 'B2:t1', 'C:t1']);
  });
});
