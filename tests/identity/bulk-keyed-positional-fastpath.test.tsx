import { describe, it, beforeAll, afterAll, expect } from 'vite-plus/test';
import { state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('bulk keyed positional fast-path', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;
  let selected: State<number | null>;
  let labelOverrides: State<Record<number, string>>;

  const resetState = async () => {
    items.set(Array.from({ length: 50 }, (_, i) => i));
    selected.set(null);
    labelOverrides.set({});
    flushScheduler();
    await waitForNextEvaluation();
  };

  beforeAll(() => {
    process.env.ASKR_BULK_TEXT_THRESHOLD = '10';

    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: 50 }, (_, i) => i));
      selected = state<number | null>(null);
      labelOverrides = state<Record<number, string>>({});
      const selectedId = selected();
      const overrides = labelOverrides();
      return (
        <ul data-selected={selectedId == null ? '' : String(selectedId)}>
          {items().map((item: number) => (
            <li
              key={item}
              data-key={String(item)}
              class={selectedId === item ? 'danger' : ''}
              aria-selected={selectedId === item ? 'true' : 'false'}
            >
              {overrides[item] ?? 'Item ' + item}
            </li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it('should reuse elements by position when keys change en-masse', async () => {
    await waitForNextEvaluation();

    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(50);

    let clickCount = 0;
    beforeEls[0].addEventListener('click', () => clickCount++);

    // Change keys en-masse (offset by 100) to ensure majority of keys are missing
    // and trigger the positional bulk fast-path which reuses elements by position.
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    // Check that bulk fast-path stats were recorded
    const ns =
      (
        globalThis as unknown as Record<string, unknown> & {
          __ASKR__?: Record<string, unknown>;
        }
      ).__ASKR__ || {};

    // Diagnostics may be recorded by either the positional fast-path or
    // the partial move-by-key path depending on heuristics; assert stats
    // only if they are present to avoid brittle test failures.
    type FastpathStats = { n?: number; reused?: number; updatedKeys?: number };
    if (ns['__LAST_FASTPATH_STATS']) {
      expect((ns['__LAST_FASTPATH_STATS'] as FastpathStats).n as number).toBe(
        50
      );
    }

    const afterEls = Array.from(container.querySelectorAll('li'));

    // Listener preserved (critical invariant)
    afterEls[0].dispatchEvent(new Event('click'));
    expect(clickCount).toBe(1);

    // Ensure data-key updated on elements
    expect(afterEls[0].getAttribute('data-key')).toBe(String(items()[0]));

    // Some fast-path counter may be recorded in dev; but primary
    // invariants we care about are listener preservation and data-key update.
    // (Diagnostic counters are optional in this test environment.)
    // Optionally assert counters if present
    if (ns['__FASTPATH_COUNTERS']) {
      expect(
        Object.keys((ns['__FASTPATH_COUNTERS'] as Record<string, number>) || {})
          .length
      ).toBeGreaterThan(0);
    }
  });

  it('should update class during positional bulk reuse', async () => {
    await waitForNextEvaluation();

    await resetState();

    selected.set(101);
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows.length).toBe(50);
    expect(rows[1].className).toBe('danger');
  });

  it('should update aria-selected during positional bulk reuse', async () => {
    await waitForNextEvaluation();

    await resetState();

    selected.set(103);
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[3].getAttribute('aria-selected')).toBe('true');
  });

  it('should keep DOM order aligned with new list order', async () => {
    await waitForNextEvaluation();

    await resetState();

    items.set(
      items()
        .map((x: number) => x + 100)
        .reverse()
    );
    flushScheduler();
    await waitForNextEvaluation();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[0].textContent).toBe('Item 149');
    expect(rows[rows.length - 1].textContent).toBe('Item 100');
  });

  it('should update a single label without touching neighbors', async () => {
    await waitForNextEvaluation();

    await resetState();

    labelOverrides.set({ 7: 'Item 7*' });
    flushScheduler();
    await waitForNextEvaluation();

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[7].textContent).toBe('Item 7*');
    expect(rows[8].textContent).toBe('Item 8');
  });

  it('should keep selection after remove+insert at head', async () => {
    await waitForNextEvaluation();

    await resetState();

    selected.set(10);
    items.set([200, ...items().slice(1)]);
    flushScheduler();
    await waitForNextEvaluation();

    const head = container.querySelector('li');
    expect(head?.getAttribute('data-key')).toBe('200');

    const selectedRow = container.querySelector('li[data-key="10"]');
    expect(selectedRow?.className).toBe('danger');
  });

  it('should clear and recreate without stale class', async () => {
    await waitForNextEvaluation();

    await resetState();

    selected.set(20);
    items.set([]);
    flushScheduler();
    await waitForNextEvaluation();

    items.set(Array.from({ length: 50 }, (_, i) => i));
    flushScheduler();
    await waitForNextEvaluation();

    const selectedRow = container.querySelector('li[data-key="20"]');
    const firstRow = container.querySelector('li[data-key="0"]');
    expect(selectedRow?.className).toBe('danger');
    expect(firstRow?.className).toBe('');
  });

  it('should update mixed props during bulk reuse', async () => {
    await waitForNextEvaluation();

    await resetState();

    labelOverrides.set({ 111: 'Item 111*' });
    selected.set(111);
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    const row = container.querySelector('li[data-key="111"]');
    expect(row?.className).toBe('danger');
    expect(row?.getAttribute('aria-selected')).toBe('true');
    expect(row?.textContent).toBe('Item 111*');
  });

  it('should swap rows without losing selection', async () => {
    await waitForNextEvaluation();

    await resetState();

    selected.set(5);
    const next = items().slice();
    const tmp = next[1];
    next[1] = next[47];
    next[47] = tmp;
    items.set(next);
    flushScheduler();
    await waitForNextEvaluation();

    const selectedRow = container.querySelector('li[data-key="5"]');
    expect(selectedRow?.className).toBe('danger');

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[1].getAttribute('data-key')).toBe(String(next[1]));
    expect(rows[47].getAttribute('data-key')).toBe(String(next[47]));
  });

  afterAll(() => {
    cleanup();
    delete process.env.ASKR_BULK_TEXT_THRESHOLD;
  });
});
