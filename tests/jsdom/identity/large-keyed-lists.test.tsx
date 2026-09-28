import { describe, it, beforeAll, afterAll, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import type { State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('large keyed lists', () => {
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

  it('should replace elements when their keys change en masse', async () => {
    await waitForNextEvaluation();

    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(50);

    let clickCount = 0;
    beforeEls[0].addEventListener('click', () => clickCount++);

    // Every new key names a new row lifetime.
    items.set(items().map((x: number) => x + 100));
    flushScheduler();
    await waitForNextEvaluation();

    const afterEls = Array.from(container.querySelectorAll('li'));

    expect(afterEls[0]).not.toBe(beforeEls[0]);
    expect(beforeEls[0].isConnected).toBe(false);
    // A native listener on the retired row must not move to a new key.
    afterEls[0].dispatchEvent(new Event('click'));
    expect(clickCount).toBe(0);

    // Ensure data-key updated on elements
    expect(afterEls[0].getAttribute('data-key')).toBe(String(items()[0]));
  });

  it('should update class when replacing many keyed rows', async () => {
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

  it('should update aria-selected when replacing many keyed rows', async () => {
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

  it('should update mixed props across many keyed rows', async () => {
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

  it('should retain keyed rows and their two children when labels change', async () => {
    const ctx = createTestContainer();
    let rows: State<Array<{ id: number; title: string; detail: string }>>;

    try {
      const Component = () => {
        rows = state(
          Array.from({ length: 12 }, (_, index) => ({
            id: index,
            title: `Title ${index}`,
            detail: `Detail ${index}`,
          }))
        );

        return (
          <ul>
            {rows().map((row) => (
              <li key={row.id} data-key={String(row.id)}>
                <span>{row.title}</span>
                <em>{row.detail}</em>
              </li>
            ))}
          </ul>
        );
      };

      createIsland({ root: ctx.container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      const beforeRow = ctx.container.querySelector('li');
      const beforeTitle = beforeRow?.children[0];
      const beforeDetail = beforeRow?.children[1];

      expect(beforeRow).not.toBeNull();
      expect(beforeTitle).not.toBeUndefined();
      expect(beforeDetail).not.toBeUndefined();

      rows!.set(
        rows!().map((row) => ({
          ...row,
          title: `Next title ${row.id}`,
          detail: `Next detail ${row.id}`,
        }))
      );
      flushScheduler();
      await waitForNextEvaluation();

      const afterRow = ctx.container.querySelector('li');

      expect(afterRow).toBe(beforeRow);
      expect(afterRow?.children).toHaveLength(2);
      expect(afterRow?.children[0]).toBe(beforeTitle);
      expect(afterRow?.children[1]).toBe(beforeDetail);
      expect(afterRow?.textContent).toBe('Next title 0Next detail 0');
    } finally {
      ctx.cleanup();
    }
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
  });
});
