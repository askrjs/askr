import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state, type StateSetter } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Order = {
  id: string;
  customer: string;
};

describe('portal row removal app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should dispose an open row menu when its keyed owner is removed', () => {
    const menuSetters = new Map<string, StateSetter<boolean>>();
    const rowSignals = new Map<string, AbortSignal>();
    let actions = 0;

    function OrderRow(
      {
        onRemove,
        order,
      }: {
        onRemove(): void;
        order: Order;
      },
      context: { signal: AbortSignal }
    ) {
      const menuOpen = state(false);
      menuSetters.set(order.id, menuOpen.set);
      rowSignals.set(order.id, context.signal);

      return (
        <li data-order={order.id}>
          <span>{`${order.id}: ${order.customer}`}</span>
          <button type="button" onClick={() => menuOpen.set(true)}>
            {`Actions ${order.id}`}
          </button>
          <button type="button" onClick={onRemove}>
            {`Remove ${order.id}`}
          </button>
          <Portal>
            {menuOpen() ? (
              <section role="menu" aria-label={`Actions for ${order.id}`}>
                <button type="button" onClick={() => (actions += 1)}>
                  Archive
                </button>
              </section>
            ) : null}
          </Portal>
        </li>
      );
    }

    function OrdersPage() {
      const orders = state<Order[]>([
        { id: '1001', customer: 'Northwind Traders' },
        { id: '1002', customer: 'Acme Corp' },
      ]);

      return (
        <main aria-label="Orders">
          <ul>
            <For each={() => orders()} by={(order) => order.id}>
              {(order) => (
                <OrderRow
                  order={order}
                  onRemove={() =>
                    orders.set((current) =>
                      current.filter((item) => item.id !== order.id)
                    )
                  }
                />
              )}
            </For>
          </ul>
        </main>
      );
    }

    createIsland({ root: container, component: OrdersPage });
    flushScheduler();

    const retainedRow = container.querySelector('[data-order="1001"]');
    const removedRow = container.querySelector('[data-order="1002"]');
    const removedSignal = rowSignals.get('1002')!;
    const staleMenuSetter = menuSetters.get('1002')!;
    const openMenu = Array.from(removedRow!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Actions 1002'
    ) as HTMLButtonElement;

    openMenu.click();
    flushScheduler();

    const staleArchive = container.querySelector(
      '[role="menu"] button'
    ) as HTMLButtonElement;
    expect(container.querySelector('[role="menu"]')?.textContent).toContain(
      'Archive'
    );

    const removeRow = Array.from(removedRow!.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remove 1002'
    ) as HTMLButtonElement;
    removeRow.click();
    flushScheduler();

    expect(container.querySelector('[data-order="1001"]')).toBe(retainedRow);
    expect(container.querySelector('[data-order="1002"]')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(removedSignal.aborted).toBe(true);

    staleMenuSetter(true);
    staleArchive.click();
    flushScheduler();

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(actions).toBe(0);
  });
});
