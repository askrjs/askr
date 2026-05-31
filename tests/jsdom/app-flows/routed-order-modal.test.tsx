import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { For } from '../../../src/control';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state } from '../../../src/runtime/state';
import { navigate } from '../../../src/router/navigate';
import {
  clearRoutes,
  getManifest,
  group,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Order = {
  id: string;
  customer: string;
};

describe('routed order modal app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    clearRoutes();
    _resetDefaultPortal();
    window.history.replaceState({}, '', '/orders');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    clearRoutes();
    _resetDefaultPortal();
    window.history.replaceState({}, '', '/');
  });

  it('should remove an open row modal when navigation replaces its owning page', async () => {
    const orders: Order[] = [
      { id: '1001', customer: 'Northwind Traders' },
      { id: '1002', customer: 'Acme Corp' },
    ];
    let modalSignal: AbortSignal | undefined;
    let fulfillCount = 0;
    let staleSelectOrder: ((order: Order | null) => void) | undefined;

    function FulfillmentModal(
      { order }: { order: Order },
      context: { signal: AbortSignal }
    ) {
      modalSignal = context.signal;

      return (
        <section role="dialog" aria-label={`Fulfill order ${order.id}`}>
          <h2>{`Fulfill order ${order.id}`}</h2>
          <button type="button" onClick={() => (fulfillCount += 1)}>
            Confirm fulfillment
          </button>
        </section>
      );
    }

    function OrdersPage() {
      const selectedOrder = state<Order | null>(null);
      staleSelectOrder = selectedOrder.set;

      return (
        <section aria-label="Orders">
          <h1>Orders</h1>
          <ul>
            <For each={orders} by={(order) => order.id}>
              {(order) => (
                <li>
                  <span>{`${order.id}: ${order.customer}`}</span>
                  <button
                    type="button"
                    onClick={() => selectedOrder.set(order)}
                  >
                    {`Fulfill ${order.id}`}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Portal>
            {selectedOrder() ? (
              <FulfillmentModal order={selectedOrder() as Order} />
            ) : null}
          </Portal>
        </section>
      );
    }

    function AppShell({ children }: { children?: unknown }) {
      return (
        <main>
          <nav aria-label="Primary navigation">Warehouse</nav>
          {children as never}
        </main>
      );
    }

    group({ layout: AppShell }, () => {
      route('/orders', OrdersPage);
      route('/settings', () => (
        <section aria-label="Settings">Settings</section>
      ));
    });

    await createSPA({ root: container, manifest: getManifest() });
    flushScheduler();

    const shell = container.querySelector('main');
    const openModal = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Fulfill 1002'
    ) as HTMLButtonElement;

    openModal.click();
    flushScheduler();

    const confirm = container.querySelector(
      '[role="dialog"] button'
    ) as HTMLButtonElement;
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Fulfill order 1002'
    );

    navigate('/settings');
    flushScheduler();

    expect(container.querySelector('[aria-label="Settings"]')).not.toBeNull();
    expect(container.querySelector('main')).toBe(shell);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(modalSignal?.aborted).toBe(true);

    staleSelectOrder?.(orders[0]);
    confirm.click();
    flushScheduler();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(fulfillCount).toBe(0);
  });
});
