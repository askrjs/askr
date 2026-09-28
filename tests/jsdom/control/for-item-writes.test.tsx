import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { For } from '@askrjs/askr/control';
import { state } from '../../../src';
import { logger } from '../../../src/common/logger';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

type Row = { id: number; done: boolean; badge?: string };

function renderRows(write: (row: Row) => void) {
  const { container, cleanup } = createTestContainer();
  createIsland({
    root: container,
    component: () => (
      <ul>
        <For
          each={() => [{ id: 1, done: false }] as Row[]}
          by={(row) => row.id}
        >
          {(row) => {
            write(row);
            return <li>{String(row.done)}</li>;
          }}
        </For>
      </ul>
    ),
  });
  flushScheduler();
  return { container, cleanup };
}

describe('For item writes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should warn in dev when a write shadows a source-item key', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { container, cleanup } = renderRows((row) => {
      row.done = true;
    });
    try {
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(/"done"/);
      // The write still succeeds; only the collision is flagged.
      expect(container.textContent).toBe('true');
    } finally {
      cleanup();
    }
  });

  it('should not warn when a write adds a property absent from the source item', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { container, cleanup } = renderRows((row) => {
      row.badge = `badge:${row.id}`;
    });
    try {
      expect(warn).not.toHaveBeenCalled();
      expect(container.textContent).toBe('false');
    } finally {
      cleanup();
    }
  });

  it('should warn once for repeated writes to the same shadowed key', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { cleanup } = renderRows((row) => {
      row.done = true;
      row.done = false;
      row.done = true;
    });
    try {
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('should forget item properties first read by a discarded render', () => {
    type Item = { id: number; label: string; details: string };
    const v1: Item = { id: 1, label: 'one', details: 'd1' };
    const v2: Item = { id: 1, label: 'one', details: 'd2' };
    let items!: ReturnType<typeof state<Item[]>>;
    let showDetails!: ReturnType<typeof state<boolean>>;
    let fail!: ReturnType<typeof state<boolean>>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          items = state<Item[]>([v1]);
          showDetails = state(false);
          fail = state(false);
          return (
            <ul>
              <For each={items} by={(item) => item.id}>
                {(item) => {
                  const details = showDetails() ? item.details : '';
                  if (fail()) throw new Error('row failed');
                  return (
                    <li>
                      {item.label}
                      {details}
                    </li>
                  );
                }}
              </For>
            </ul>
          );
        },
      });
      flushScheduler();
      expect(container.textContent).toBe('one');

      items.set([v2]);
      showDetails.set(true);
      fail.set(true);
      expect(() => flushScheduler()).toThrow('row failed');

      fail.set(false);
      items.set([v1]);
      flushScheduler();
      expect(container.textContent).toBe('oned1');
    } finally {
      cleanup();
    }
  });
});
