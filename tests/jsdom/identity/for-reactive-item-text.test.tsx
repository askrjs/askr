/**
 * tests/identity/for-reactive-item-text.test.tsx
 *
 * REGRESSION TEST: Text content updates in reactive For loops
 *
 * Bug: When For loop items have properties that change reactively,
 * the text content in the rendered DOM should update to reflect those changes.
 *
 * Root cause: For boundary vnodes were being wrapped into arrays before
 * being passed to updateElementChildren, which prevented the For boundary
 * detection logic from working. This caused text content updates to be missed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import type { State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { For } from '../../../src/control';

function resetFineGrainedDiagnostics(): void {
  const ns = (
    globalThis as typeof globalThis & {
      __ASKR__?: Record<string, unknown>;
    }
  ).__ASKR__;

  if (!ns) {
    return;
  }

  ns['componentReruns'] = 0;
  ns['effectRuns'] = 0;
  ns['textNodeWrites'] = 0;
}

describe('for-reactive-item-text (REGRESSION: text updates in reactive arrays)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should update text content when array item properties change (3-item list)', () => {
    let items: State<Array<{ id: number; label: string }>> | null = null;

    const Component = () => {
      items = state([
        { id: 1, label: 'Item 1' },
        { id: 2, label: 'Item 2' },
        { id: 3, label: 'Item 3' },
      ]);

      return (
        <div>
          {
            <For each={() => items!()} by={(item) => item.id}>
              {(item) => (
                <div key={item.id} data-id={item.id}>
                  {item.label}
                </div>
              )}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Verify initial state
    expect(container.querySelector('[data-id="1"]')?.textContent).toBe(
      'Item 1'
    );
    expect(container.querySelector('[data-id="2"]')?.textContent).toBe(
      'Item 2'
    );
    expect(container.querySelector('[data-id="3"]')?.textContent).toBe(
      'Item 3'
    );

    // Update item labels
    items!.set([
      { id: 1, label: 'Item 1 !!!' },
      { id: 2, label: 'Item 2 !!!' },
      { id: 3, label: 'Item 3 !!!' },
    ]);
    flushScheduler();

    // Verify text content updated
    expect(container.querySelector('[data-id="1"]')?.textContent).toBe(
      'Item 1 !!!'
    );
    expect(container.querySelector('[data-id="2"]')?.textContent).toBe(
      'Item 2 !!!'
    );
    expect(container.querySelector('[data-id="3"]')?.textContent).toBe(
      'Item 3 !!!'
    );
  });

  it('should update text content in bulk positional update (100-item list)', () => {
    let items: State<Array<{ id: number; label: string }>> | null = null;

    const Component = () => {
      items = state(
        Array.from({ length: 100 }, (_, i) => ({
          id: i,
          label: `Item ${i}`,
        }))
      );

      return (
        <div>
          {
            <For each={() => items!()} by={(item) => item.id}>
              {(item) => (
                <div key={item.id} data-id={item.id}>
                  {item.label}
                </div>
              )}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Verify some initial text
    expect(container.querySelector('[data-id="0"]')?.textContent).toBe(
      'Item 0'
    );
    expect(container.querySelector('[data-id="50"]')?.textContent).toBe(
      'Item 50'
    );
    expect(container.querySelector('[data-id="99"]')?.textContent).toBe(
      'Item 99'
    );

    // Update all labels (should trigger positional fast-path)
    items!.set(
      items!().map((item) => ({
        id: item.id,
        label: `Item ${item.id} (updated)`,
      }))
    );
    flushScheduler();

    // Verify text updated throughout
    expect(container.querySelector('[data-id="0"]')?.textContent).toBe(
      'Item 0 (updated)'
    );
    expect(container.querySelector('[data-id="50"]')?.textContent).toBe(
      'Item 50 (updated)'
    );
    expect(container.querySelector('[data-id="99"]')?.textContent).toBe(
      'Item 99 (updated)'
    );
  });

  it('should update text content with mixed text/element children', () => {
    let items: State<
      Array<{ id: number; prefix: string; count: number }>
    > | null = null;

    const Component = () => {
      items = state([
        { id: 1, prefix: 'Item', count: 1 },
        { id: 2, prefix: 'Item', count: 2 },
      ]);

      return (
        <div>
          {
            <For each={() => items!()} by={(item) => item.id}>
              {(item) => (
                <div key={item.id} data-id={item.id}>
                  {`${item.prefix} ${item.count}`}
                  <span>{` (count: ${item.count})`}</span>
                </div>
              )}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(container.querySelector('[data-id="1"]')?.textContent).toBe(
      'Item 1 (count: 1)'
    );
    expect(container.querySelector('[data-id="2"]')?.textContent).toBe(
      'Item 2 (count: 2)'
    );

    // Update items
    items!.set([
      { id: 1, prefix: 'Updated', count: 10 },
      { id: 2, prefix: 'Updated', count: 20 },
    ]);
    flushScheduler();

    expect(container.querySelector('[data-id="1"]')?.textContent).toBe(
      'Updated 10 (count: 10)'
    );
    expect(container.querySelector('[data-id="2"]')?.textContent).toBe(
      'Updated 20 (count: 20)'
    );
  });

  it('should preserve DOM identity while updating text across reorder', () => {
    let items: State<Array<{ id: number; label: string }>> | null = null;

    const Component = () => {
      items = state([
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
        { id: 3, label: 'C' },
      ]);

      return (
        <div>
          {
            <For each={() => items!()} by={(item) => item.id}>
              {(item) => (
                <div key={item.id} data-id={item.id}>
                  {item.label}
                </div>
              )}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const firstEl2 = container.querySelector('[data-id="2"]') as HTMLElement;
    expect(firstEl2.textContent).toBe('B');

    // Reorder and update labels
    items!.set([
      { id: 3, label: 'C-updated' },
      { id: 1, label: 'A-updated' },
      { id: 2, label: 'B-updated' },
    ]);
    flushScheduler();

    const secondEl2 = container.querySelector('[data-id="2"]') as HTMLElement;
    // Same element (identity preserved by key)
    expect(firstEl2).toBe(secondEl2);
    // But text should be updated
    expect(secondEl2.textContent).toBe('B-updated');
  });

  it('should update a keyed row label through a row-local text effect', () => {
    let items: State<Array<{ id: number; label: string }>> | null = null;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      items = state([
        { id: 1, label: 'Alpha' },
        { id: 2, label: 'Beta' },
        { id: 3, label: 'Gamma' },
      ]);

      return (
        <ul>
          <For each={() => items!()} by={(item) => item.id}>
            {(item) => <li>{() => item.label}</li>}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowsBefore = Array.from(container.querySelectorAll('li'));
    const firstTextNodes = rowsBefore.map((row) => row.firstChild);

    expect(parentRenderCount).toBe(1);
    expect(rowsBefore[0]?.textContent).toBe('Alpha');
    expect(rowsBefore[1]?.textContent).toBe('Beta');
    expect(rowsBefore[2]?.textContent).toBe('Gamma');

    resetFineGrainedDiagnostics();

    items!.set([
      { id: 1, label: 'Alpha!' },
      { id: 2, label: 'Beta' },
      { id: 3, label: 'Gamma' },
    ]);
    flushScheduler();

    const ns = (
      globalThis as typeof globalThis & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__;

    const rowsAfter = Array.from(container.querySelectorAll('li'));
    expect(parentRenderCount).toBe(1);
    expect(ns?.['componentReruns']).toBe(0);
    expect(ns?.['textNodeWrites']).toBe(1);
    expect(rowsAfter[0]?.textContent).toBe('Alpha!');
    expect(rowsAfter[1]?.textContent).toBe('Beta');
    expect(rowsAfter[2]?.textContent).toBe('Gamma');
    expect(rowsAfter[0]?.firstChild).toBe(firstTextNodes[0]);
    expect(rowsAfter[1]?.firstChild).toBe(firstTextNodes[1]);
    expect(rowsAfter[2]?.firstChild).toBe(firstTextNodes[2]);
  });
});
