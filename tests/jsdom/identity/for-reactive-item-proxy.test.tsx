import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { state } from '../../../src/index';
import type { State } from '../../../src/index';
import { For } from '../../../src/control';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('for-reactive-item-proxy', () => {
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

  it('should preserve own properties assigned on the reactive item proxy across updates', () => {
    let items: State<Array<{ id: number; label: string }>> | null = null;

    type RowProxy = {
      id: number;
      label: string;
      badge?: string;
    };

    const Component = () => {
      items = state([{ id: 1, label: 'Alpha' }]);

      return (
        <div>
          <For each={() => items!()} by={(item) => item.id}>
            {(item) => {
              const row = item as RowProxy;
              row.badge ??= `badge:${row.label}`;

              return (
                <div data-id={String(row.id)} data-badge={row.badge}>
                  {row.badge}
                </div>
              );
            }}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowBefore = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowBefore?.textContent).toBe('badge:Alpha');
    expect(rowBefore?.getAttribute('data-badge')).toBe('badge:Alpha');

    items!.set([{ id: 1, label: 'Beta' }]);
    flushScheduler();

    const rowAfter = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.textContent).toBe('badge:Alpha');
    expect(rowAfter?.getAttribute('data-badge')).toBe('badge:Alpha');
  });

  it('should surface current keys, descriptors, and property presence through the reactive item proxy', () => {
    let items: State<Array<{ id: number; label: string; extra?: string }>> | null = null;

    const Component = () => {
      items = state([{ id: 1, label: 'Alpha' }]);

      return (
        <div>
          <For each={() => items!()} by={(item) => item.id}>
            {(item) => {
              const keys = Reflect.ownKeys(item as object)
                .filter((key): key is string => typeof key === 'string')
                .sort()
                .join(',');
              const labelDescriptor = Object.getOwnPropertyDescriptor(
                item as Record<string, unknown>,
                'label'
              );
              const hasExtra = 'extra' in item;

              return (
                <div
                  data-id={String(item.id)}
                  data-keys={keys}
                  data-label-enumerable={String(
                    labelDescriptor?.enumerable ?? false
                  )}
                  data-has-extra={String(hasExtra)}
                >
                  {item.label}
                </div>
              );
            }}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowBefore = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowBefore?.textContent).toBe('Alpha');
    expect(rowBefore?.getAttribute('data-keys')).toBe('id,label');
    expect(rowBefore?.getAttribute('data-label-enumerable')).toBe('true');
    expect(rowBefore?.getAttribute('data-has-extra')).toBe('false');

    items!.set([{ id: 1, label: 'Beta', extra: 'present' }]);
    flushScheduler();

    const rowAfter = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.textContent).toBe('Beta');
    expect(rowAfter?.getAttribute('data-keys')).toBe('extra,id,label');
    expect(rowAfter?.getAttribute('data-label-enumerable')).toBe('true');
    expect(rowAfter?.getAttribute('data-has-extra')).toBe('true');
  });

  it('should include current source props and proxy-owned props when spreading the reactive item proxy', () => {
    let items: State<Array<{ id: number; label: string; extra?: string }>> | null = null;

    type RowProxy = {
      id: number;
      label: string;
      extra?: string;
      badge?: string;
    };

    const Component = () => {
      items = state([{ id: 1, label: 'Alpha' }]);

      return (
        <div>
          <For each={() => items!()} by={(item) => item.id}>
            {(item) => {
              const row = item as RowProxy;
              row.badge ??= `badge:${row.label}`;
              const snapshot = { ...row };

              return (
                <div
                  data-id={String(snapshot.id)}
                  data-snapshot-keys={Object.keys(snapshot).join(',')}
                  data-snapshot-label={snapshot.label}
                  data-snapshot-extra={snapshot.extra ?? ''}
                  data-snapshot-badge={snapshot.badge}
                >
                  {JSON.stringify(snapshot)}
                </div>
              );
            }}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowBefore = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowBefore?.getAttribute('data-snapshot-keys')).toBe('badge,id,label');
    expect(rowBefore?.getAttribute('data-snapshot-label')).toBe('Alpha');
    expect(rowBefore?.getAttribute('data-snapshot-extra')).toBe('');
    expect(rowBefore?.getAttribute('data-snapshot-badge')).toBe('badge:Alpha');
    expect(rowBefore?.textContent).toBe(
      '{"badge":"badge:Alpha","id":1,"label":"Alpha"}'
    );

    items!.set([{ id: 1, label: 'Beta', extra: 'present' }]);
    flushScheduler();

    const rowAfter = container.querySelector(
      '[data-id="1"]'
    ) as HTMLDivElement | null;

    expect(rowAfter).toBe(rowBefore);
    expect(rowAfter?.getAttribute('data-snapshot-keys')).toBe(
      'badge,id,label,extra'
    );
    expect(rowAfter?.getAttribute('data-snapshot-label')).toBe('Beta');
    expect(rowAfter?.getAttribute('data-snapshot-extra')).toBe('present');
    expect(rowAfter?.getAttribute('data-snapshot-badge')).toBe('badge:Alpha');
    expect(rowAfter?.textContent).toBe(
      '{"badge":"badge:Alpha","id":1,"label":"Beta","extra":"present"}'
    );
  });
});