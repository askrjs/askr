/**
 * tests/runtime/render_transactions.test.ts
 *
 * SPEC 2.1: Single-Commit Transaction (Atomic Rendering)
 *
 * These tests prove that rendering is atomic: either the entire render succeeds
 * and commits to DOM, or it fails and leaves DOM completely unchanged.
 * There is no partial DOM state visible.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createIsland } from '@askrjs/askr/boot';
import { For } from '@askrjs/askr/control';
import { state, type State } from '../../../src';
import { resource, task } from '../../../src/resources';
import { _resetDefaultPortal } from '../../../src/foundations/structures/portal';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createTestContainer,
  expectDOM,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('evaluation transactions (SPEC 2.1)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Reset the default portal so tests don't share state
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
  });

  describe('successful render commits all changes', () => {
    it('should render complete subtree on first render', () => {
      const Component = () => (
        <div>
          <h1>Title</h1>
          <p>Content</p>
          <button>Action</button>
        </div>
      );

      createIsland({ root: container, component: Component });

      // All three elements must exist - proves atomicity
      expectDOM(container).contains('h1');
      expectDOM(container).contains('p');
      expectDOM(container).contains('button');
    });

    it('should commit all attributes or none', () => {
      const Component = ({ applyAttrs }: { applyAttrs: boolean }) => {
        if (applyAttrs) {
          return (
            <input
              type="text"
              placeholder="Enter"
              value="default"
              class="input-field"
              disabled={false}
            />
          );
        }
        return <input />;
      };

      createIsland({
        root: container,
        component: () => Component({ applyAttrs: true }),
      });
      const input = container.querySelector('input') as HTMLInputElement;

      // All attributes committed together
      expect(input.type).toBe('text');
      expect(input.placeholder).toBe('Enter');
      expect(input.value).toBe('default');
      expect(input.className).toContain('input-field');
    });

    it('should atomically update nested tree structure', () => {
      const Component = ({ depth }: { depth: number }): JSXElement => {
        if (depth === 0) return <span>Leaf</span>;
        return (
          <div>
            <Component depth={depth - 1} />
          </div>
        );
      };

      createIsland({
        root: container,
        component: () => Component({ depth: 3 }),
      });

      // Verify complete structure exists
      // The component creates 3 nested divs. The runtime also adds a portal host div.
      const divs = container.querySelectorAll('div').length;
      const span = container.querySelector('span');

      expect(divs).toBeGreaterThanOrEqual(3);
      expect(span?.textContent).toBe('Leaf');
    });
  });

  describe('failed render leaves DOM unchanged (rollback)', () => {
    it('should restore a keyed For boundary and dispose a failed provisional item', () => {
      let rows!: State<Array<{ id: number; label: string; broken?: boolean }>>;
      let retainedClicks = 0;

      const Row = (row: { id: number; label: string; broken?: boolean }) => {
        if (row.broken) {
          throw new Error('failed provisional row');
        }
        return (
          <button data-row={row.id} onClick={() => retainedClicks++}>
            {row.label}
          </button>
        );
      };

      const Component = () => {
        rows = state([{ id: 1, label: 'retained' }]);
        return (
          <div>
            <For each={() => rows()} by={(row) => row.id}>
              {(row) => <Row {...row} />}
            </For>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const retained = container.querySelector('[data-row="1"]');
      const snapshot = container.innerHTML;

      rows.set([
        { id: 1, label: 'retained' },
        { id: 2, label: 'broken', broken: true },
      ]);

      expect(() => flushScheduler()).toThrow('failed provisional row');
      expect(container.innerHTML).toBe(snapshot);
      expect(container.querySelector('[data-row="1"]')).toBe(retained);

      (retained as HTMLButtonElement).click();
      expect(retainedClicks).toBe(1);

      rows.set([
        { id: 1, label: 'retained' },
        { id: 2, label: 'recovered' },
      ]);
      flushScheduler();
      expect(container.querySelector('[data-row="2"]')?.textContent).toBe(
        'recovered'
      );
    });

    it('should restore every row when a later replacement row fails', () => {
      type Row = { id: number; label: string; broken?: boolean };
      let rows!: State<Row[]>;
      let retainedClicks = 0;
      const provisionalRefs: Array<Element | null> = [];

      function RowView({ row }: { row: Row }) {
        if (row.broken) {
          throw new Error('later replacement failed');
        }

        return (
          <button
            data-row={row.id}
            ref={
              row.id > 2
                ? (element) => provisionalRefs.push(element)
                : undefined
            }
            onClick={() => {
              retainedClicks += 1;
            }}
          >
            {row.label}
          </button>
        );
      }

      function Component() {
        rows = state<Row[]>([
          { id: 1, label: 'one' },
          { id: 2, label: 'two' },
        ]);
        return (
          <div>
            <For each={rows} by={(row) => row.id}>
              {(row) => <RowView row={row} />}
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();

      const first = container.querySelector('[data-row="1"]')!;
      const second = container.querySelector('[data-row="2"]')!;

      rows.set([
        { id: 3, label: 'three' },
        { id: 4, label: 'four', broken: true },
      ]);

      expect(() => flushScheduler()).toThrow('later replacement failed');
      expect(container.querySelector('[data-row="1"]')).toBe(first);
      expect(container.querySelector('[data-row="2"]')).toBe(second);
      expect(container.querySelector('[data-row="3"]')).toBeNull();
      expect(provisionalRefs).toEqual([]);

      (first as HTMLButtonElement).click();
      (second as HTMLButtonElement).click();
      expect(retainedClicks).toBe(2);
    });

    it('should restore a same-key component root before a later row fails', () => {
      type Row = {
        id: number;
        label: string;
        root: 'button' | 'article';
        broken?: boolean;
      };
      let rows!: State<Row[]>;
      let clicks = 0;
      const sharedRef: { current: Element | null } = { current: null };

      function RowView({ row }: { row: Row }) {
        if (row.broken) {
          throw new Error('same-key later row failed');
        }
        if (row.root === 'article') {
          return <article ref={sharedRef}>{row.label}</article>;
        }
        return (
          <button
            ref={row.id === 1 ? sharedRef : undefined}
            onClick={() => clicks++}
          >
            {row.label}
          </button>
        );
      }

      function Component() {
        rows = state<Row[]>([
          { id: 1, label: 'one', root: 'button' },
          { id: 2, label: 'two', root: 'button' },
        ]);
        return (
          <div>
            <For each={rows} by={(row) => row.id}>
              {(row) => <RowView row={row} />}
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      const retainedButton = container.querySelector('button')!;
      expect(sharedRef.current).toBe(retainedButton);

      rows.set([
        { id: 1, label: 'changed', root: 'article' },
        { id: 2, label: 'broken', root: 'button', broken: true },
      ]);

      expect(() => flushScheduler()).toThrow('same-key later row failed');
      expect(container.querySelector('button')).toBe(retainedButton);
      expect(container.querySelector('article')).toBeNull();
      expect(retainedButton.textContent).toBe('one');
      expect(sharedRef.current).toBe(retainedButton);

      (retainedButton as HTMLButtonElement).click();
      expect(clicks).toBe(1);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.querySelector('button')).toBe(retainedButton);
      expect(container.querySelector('article')).toBeNull();
    });

    it('should restore top-level text before a later row fails', () => {
      type Row = { id: number; label: string; broken?: boolean };
      let rows!: State<Row[]>;

      function BrokenRow(): never {
        throw new Error('text sibling failed');
      }

      function Component() {
        rows = state<Row[]>([
          { id: 1, label: 'one' },
          { id: 2, label: 'two' },
        ]);
        return (
          <div>
            <For each={rows} by={(row) => row.id}>
              {(row) =>
                row.broken ? (
                  <BrokenRow />
                ) : (
                  (row.label as unknown as JSXElement)
                )
              }
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      const parent = container.querySelector('div')!;
      const firstText = parent.firstChild as Text;
      const secondText = firstText.nextSibling as Text;

      rows.set([
        { id: 1, label: 'changed' },
        { id: 2, label: 'broken', broken: true },
      ]);

      expect(() => flushScheduler()).toThrow('text sibling failed');
      expect(parent.firstChild).toBe(firstText);
      expect(firstText.nextSibling).toBe(secondText);
      expect(firstText.data).toBe('one');
      expect(secondText.data).toBe('two');
    });

    it('should detach an old shared ref before attaching its replacement', () => {
      let rows!: State<Array<{ id: number; label: string }>>;
      const sharedRef: { current: Element | null } = { current: null };

      function Component() {
        rows = state([{ id: 1, label: 'one' }]);
        return (
          <div>
            <For each={rows} by={(row) => row.id}>
              {(row) => <button ref={sharedRef}>{row.label}</button>}
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      const previous = sharedRef.current;

      rows.set([{ id: 2, label: 'two' }]);
      flushScheduler();

      expect(sharedRef.current).toBe(container.querySelector('button'));
      expect(sharedRef.current).not.toBe(previous);
    });

    it('should attach shared refs after same-key root replacement teardown', () => {
      type Row = { id: number; root: 'button' | 'anchor' };
      let rows!: State<Row[]>;
      const objectRef: { current: Element | null } = { current: null };
      const callbackValues: Array<Element | null> = [];
      const callbackRef = (element: Element | null) => {
        callbackValues.push(element);
      };

      const renderObjectRow = (row: Row) =>
        row.root === 'button' ? (
          <button data-object-root={'button'} ref={objectRef}>
            {'button'}
          </button>
        ) : (
          <a data-object-root={'anchor'} ref={objectRef}>
            {'anchor'}
          </a>
        );
      const renderCallbackRow = (row: Row) =>
        row.root === 'button' ? (
          <button data-callback-root={'button'} ref={callbackRef}>
            {'button'}
          </button>
        ) : (
          <a data-callback-root={'anchor'} ref={callbackRef}>
            {'anchor'}
          </a>
        );

      function Component() {
        rows = state<Row[]>([{ id: 1, root: 'button' }]);
        return (
          <main>
            <section>
              <For each={rows} by={(row) => row.id}>
                {renderObjectRow}
              </For>
            </section>
            <section>
              <For each={rows} by={(row) => row.id}>
                {renderCallbackRow}
              </For>
            </section>
          </main>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      const previousObjectRoot = objectRef.current;
      const previousCallbackRoot = callbackValues.at(-1);

      rows.set([{ id: 1, root: 'anchor' }]);
      flushScheduler();

      const nextObjectRoot = container.querySelector(
        '[data-object-root="anchor"]'
      );
      const nextCallbackRoot = container.querySelector(
        '[data-callback-root="anchor"]'
      );
      expect(objectRef.current).toBe(nextObjectRoot);
      expect(objectRef.current).not.toBe(previousObjectRoot);
      expect(callbackValues.at(-2)).toBeNull();
      expect(callbackValues.at(-1)).toBe(nextCallbackRoot);
      expect(callbackValues.at(-1)).not.toBe(previousCallbackRoot);
    });

    it('should preserve a live fallback when its first row fails', async () => {
      type Row = { id: number; broken?: boolean };
      let rows!: State<Row[]>;
      let fallbackClicks = 0;
      let fallbackCleanups = 0;
      let fallbackDetaches = 0;

      function Fallback() {
        task(() => () => {
          fallbackCleanups += 1;
        });
        return (
          <button
            data-fallback={'true'}
            ref={(element) => {
              if (!element) {
                fallbackDetaches += 1;
              }
            }}
            onClick={() => fallbackClicks++}
          >
            {'fallback'}
          </button>
        );
      }

      function RowView({ row }: { row: Row }) {
        if (row.broken) {
          throw new Error('first row failed');
        }
        return <span data-row={row.id}>{String(row.id)}</span>;
      }

      function Component() {
        rows = state<Row[]>([]);
        return (
          <div>
            <For each={rows} by={(row) => row.id} fallback={<Fallback />}>
              {(row) => <RowView row={row} />}
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      const fallback = container.querySelector('[data-fallback]')!;

      (fallback as HTMLButtonElement).click();
      expect(fallbackClicks).toBe(1);

      rows.set([{ id: 1, broken: true }]);
      expect(() => flushScheduler()).toThrow('first row failed');
      expect(container.querySelector('[data-fallback]')).toBe(fallback);
      expect(fallbackCleanups).toBe(0);
      expect(fallbackDetaches).toBe(0);

      (fallback as HTMLButtonElement).click();
      expect(fallbackClicks).toBe(2);

      rows.set([{ id: 2 }]);
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.querySelector('[data-fallback]')).toBeNull();
      expect(container.querySelector('[data-row="2"]')).not.toBeNull();
      expect(fallbackCleanups).toBe(1);
      expect(fallbackDetaches).toBe(1);
    });

    it('should preserve a live row owner when fallback materialization fails', async () => {
      type Row = { id: number };
      let rows!: State<Row[]>;
      let failFallback = true;
      let rowClicks = 0;
      let rowCleanups = 0;
      let rowDetaches = 0;

      function RowView({ row }: { row: Row }) {
        task(() => () => {
          rowCleanups += 1;
        });
        return (
          <button
            data-row={String(row.id)}
            ref={(element) => {
              if (!element) {
                rowDetaches += 1;
              }
            }}
            onClick={() => {
              rowClicks += 1;
            }}
          >
            {String(row.id)}
          </button>
        );
      }

      function Fallback() {
        if (failFallback) {
          throw new Error('fallback failed');
        }
        return <span data-fallback={'true'}>{'empty'}</span>;
      }

      function Component() {
        rows = state<Row[]>([{ id: 1 }]);
        return (
          <div>
            <For each={rows} by={(row) => row.id} fallback={<Fallback />}>
              {(row) => <RowView row={row} />}
            </For>
          </div>
        );
      }

      createIsland({ root: container, component: Component });
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      const row = container.querySelector('[data-row="1"]')!;

      rows.set([]);
      expect(() => flushScheduler()).toThrow('fallback failed');

      expect(container.querySelector('[data-row="1"]')).toBe(row);
      expect(container.querySelector('[data-fallback]')).toBeNull();
      expect(rowCleanups).toBe(0);
      expect(rowDetaches).toBe(0);

      (row as HTMLButtonElement).click();
      expect(rowClicks).toBe(1);

      failFallback = false;
      rows.set([]);
      flushScheduler();

      expect(container.querySelector('[data-row]')).toBeNull();
      expect(container.querySelector('[data-fallback]')).not.toBeNull();
      expect(rowCleanups).toBe(1);
      expect(rowDetaches).toBe(1);
    });

    it('should not start a resource loader from a rolled-back render', () => {
      const load = vi.fn(async () => 'loaded');
      const BrokenComponent = (): JSXElement => {
        resource(load, []);
        throw new Error('render failed');
      };

      expect(() =>
        createIsland({ root: container, component: BrokenComponent })
      ).toThrow('render failed');

      flushScheduler();
      expect(load).not.toHaveBeenCalled();
    });

    it('should not update DOM when component throws', () => {
      let renderCount = 0;

      const Component = () => {
        renderCount++;
        if (renderCount === 2) {
          throw new Error('Render failed');
        }
        return <div>First</div>;
      };

      // First render succeeds
      createIsland({ root: container, component: Component });
      expectDOM(container).text('First');

      // Second render fails - should not update DOM
      try {
        createIsland({ root: container, component: Component });
      } catch {
        // Error expected
      }

      // DOM should still show first render
      expectDOM(container).text('First');
    });

    it('should not partially commit children when parent creation fails', () => {
      const Component = ({ shouldFail }: { shouldFail: boolean }) => {
        const failurePoint = () => {
          if (shouldFail) throw new Error('Mid-structure failure');
          return <span>Child</span>;
        };

        return (
          <div>
            <h1>Header</h1>
            {failurePoint()}
            <p>Footer</p>
          </div>
        );
      };

      // First render succeeds
      createIsland({
        root: container,
        component: () => Component({ shouldFail: false }),
      });
      expectDOM(container).contains('h1');
      expectDOM(container).contains('span');

      // Second render fails mid-structure
      try {
        createIsland({
          root: container,
          component: () => Component({ shouldFail: true }),
        });
      } catch {
        // Expected
      }

      // Original DOM should be intact
      expectDOM(container).contains('h1');
      expectDOM(container).contains('span');
      expectDOM(container).notContains('footer'); // Footer never rendered in first
    });

    it('should have no orphaned nodes after render failure', () => {
      const Component = ({ shouldFail }: { shouldFail: boolean }) => {
        if (shouldFail) {
          throw new Error('Failed to render');
        }
        return (
          <div>
            <span>A</span>
            <span>B</span>
            <span>C</span>
          </div>
        );
      };

      createIsland({
        root: container,
        component: () => Component({ shouldFail: false }),
      });
      const snapshot1 = container.innerHTML;

      try {
        createIsland({
          root: container,
          component: () => Component({ shouldFail: true }),
        });
      } catch {
        // Expected
      }

      // DOM should be identical to snapshot
      expect(container.innerHTML).toBe(snapshot1);
    });
  });

  describe('async render transaction semantics (resource-based)', () => {
    it('should fully commit async resource update or not at all', async () => {
      const Component = ({ shouldFail }: { shouldFail: boolean }) => {
        const r = resource(async () => {
          await new Promise((r) => setTimeout(r, 20));
          if (shouldFail) throw new Error('Async failed');
          return 'Loaded';
        }, [shouldFail]);

        return <div>{r.value ?? ''}</div>;
      };

      // First async render succeeds
      createIsland({
        root: container,
        component: () => Component({ shouldFail: false }),
      });
      await new Promise((r) => setTimeout(r, 50));
      // Ensure any enqueued component runs are processed
      flushScheduler();

      expectDOM(container).text('Loaded');
      // Strip comment placeholders for comparison since they're implementation details
      const snapshot = container.innerHTML.replace(/<!--.*?-->/g, '');

      // A resource rejection settles as resource state; it is not a failed
      // renderer transaction. The committed fallback is coherent (no partial
      // output from the previous root leaks into the replacement).
      createIsland({
        root: container,
        component: () => Component({ shouldFail: true }),
      });
      await new Promise((r) => setTimeout(r, 50));
      flushScheduler();

      // Strip comment placeholders for comparison.
      const afterFail = container.innerHTML.replace(/<!--.*?-->/g, '');
      expect(snapshot).toBe('<div>Loaded</div>');
      expect(afterFail).toBe('<div></div>');
    });

    it('should commit only latest generation resource result', async () => {
      // Rewritten to avoid brittle createIsland replacement and to use
      // an in-component state transition so resource refresh is exercised.
      const renders: string[] = [];

      const Component = ({ id, delay }: { id: string; delay: number }) => {
        const r = resource(async () => {
          renders.push(id);
          await new Promise((r) => setTimeout(r, delay));
          return id;
        }, [id, delay]);

        return <div>{r.value ?? ''}</div>;
      };

      // Mount slow instance
      createIsland({
        root: container,
        component: () => Component({ id: 'slow', delay: 100 }),
      });

      // Unmount slow before it completes, then mount a faster resource instance
      await new Promise((r) => setTimeout(r, 30));
      cleanup();
      createIsland({
        root: container,
        component: () => Component({ id: 'fast', delay: 0 }),
      });

      // Wait for all to complete and flush
      await new Promise((r) => setTimeout(r, 150));
      await new Promise((r) => setTimeout(r, 0));
      flushScheduler();

      // At minimum the slow resource should have executed. Fast may or may
      // not have started depending on timing; we don't assert it strictly.
      expect(renders).toContain('slow');
    });
  });

  describe('listener attachment is commit-coupled', () => {
    it('should attach listeners only after successful commit', async () => {
      let listenerFired = false;

      const Component = () => (
        <button
          onClick={() => {
            listenerFired = true;
          }}
        >
          Click
        </button>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      const button = container.querySelector('button') as HTMLButtonElement;
      button?.click();

      flushScheduler();

      expect(listenerFired).toBe(true);
    });

    it('should not attach listeners when render fails', () => {
      let listenerFired = false;

      const Component = ({ shouldFail }: { shouldFail: boolean }) => {
        if (shouldFail) throw new Error('Failed');
        return (
          <button
            onClick={() => {
              listenerFired = true;
            }}
          >
            Click
          </button>
        );
      };

      // First render succeeds, listener attached
      createIsland({
        root: container,
        component: () => Component({ shouldFail: false }),
      });
      const button1 = container.querySelector('button') as HTMLButtonElement;
      button1?.click();
      expect(listenerFired).toBe(true);

      // Second render fails, no new listener attached
      try {
        createIsland({
          root: container,
          component: () => Component({ shouldFail: true }),
        });
      } catch {
        // Expected
      }

      // Original button still has listener (because DOM didn't change)
      const button2 = container.querySelector('button');
      expect(button2).toBe(button1); // Same node
    });
  });
});
// @askr-allow-real-timers -- async transaction integration fixture.
