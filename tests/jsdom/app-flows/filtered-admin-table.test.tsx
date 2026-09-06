import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { derive } from '../../../src/runtime/reactivity/derive';
import { state, type StateSetter } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Order = {
  id: string;
  customer: string;
  note: string;
};

const initialOrders: Order[] = [
  { id: '1001', customer: 'Northwind Traders', note: 'Invoice next week' },
  { id: '1002', customer: 'Acme Corp', note: 'Paid by card' },
  { id: '1003', customer: 'Globex', note: 'Needs approval' },
];

function cloneOrders(): Order[] {
  return initialOrders.map((order) => ({ ...order }));
}

describe('filtered admin table app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve retained row drafts and dispose filtered or removed row ownership', () => {
    const latestDraftSetters = new Map<string, StateSetter<string>>();
    const latestSignals = new Map<string, AbortSignal>();

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
      const draft = state(order.note);
      latestDraftSetters.set(order.id, draft.set);
      latestSignals.set(order.id, context.signal);

      return (
        <li data-order-id={order.id}>
          <span>{`${order.id}: ${order.customer}`}</span>
          <label>
            {`Note for ${order.id}`}
            <input
              aria-label={`Note for ${order.id}`}
              value={draft()}
              onInput={(event: Event) =>
                draft.set((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <button type="button" onClick={onRemove}>
            {`Remove ${order.id}`}
          </button>
        </li>
      );
    }

    function AdminTable() {
      const orders = state(cloneOrders());
      const query = state('');
      const descending = state(false);
      const visibleOrders = derive(() => {
        const normalizedQuery = query().trim().toLowerCase();
        return orders()
          .filter((order) =>
            order.customer.toLowerCase().includes(normalizedQuery)
          )
          .slice()
          .sort((left, right) => {
            const comparison = left.customer.localeCompare(right.customer);
            return descending() ? -comparison : comparison;
          });
      });

      return (
        <section aria-label="Order administration">
          <label>
            Filter customers
            <input
              aria-label="Filter customers"
              value={query()}
              onInput={(event: Event) =>
                query.set((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <button
            type="button"
            onClick={() => descending.set((current) => !current)}
          >
            Sort customers
          </button>
          <button type="button" onClick={() => orders.set(cloneOrders())}>
            Restore orders
          </button>
          <ul>
            <For each={() => visibleOrders()} by={(order) => order.id}>
              {(order) => (
                <OrderRow
                  order={order}
                  onRemove={() =>
                    orders.set((current) =>
                      current.filter((candidate) => candidate.id !== order.id)
                    )
                  }
                />
              )}
            </For>
          </ul>
        </section>
      );
    }

    createIsland({ root: container, component: AdminTable });
    flushScheduler();

    const draftBeforeSort = container.querySelector(
      '[aria-label="Note for 1002"]'
    ) as HTMLInputElement;
    draftBeforeSort.value = 'Call purchasing';
    draftBeforeSort.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const sort = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Sort customers'
    ) as HTMLButtonElement;
    sort.click();
    flushScheduler();

    const draftAfterSort = container.querySelector(
      '[aria-label="Note for 1002"]'
    ) as HTMLInputElement;
    expect(draftAfterSort).toBe(draftBeforeSort);
    expect(draftAfterSort.value).toBe('Call purchasing');

    const filteredSignal = latestSignals.get('1002')!;
    const filteredSetter = latestDraftSetters.get('1002')!;
    const filter = container.querySelector(
      '[aria-label="Filter customers"]'
    ) as HTMLInputElement;
    filter.value = 'Northwind';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect(container.querySelector('[data-order-id="1002"]')).toBeNull();
    expect(filteredSignal.aborted).toBe(true);

    filteredSetter('stale filtered draft');
    filter.value = '';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const restoredAfterFilter = container.querySelector(
      '[aria-label="Note for 1002"]'
    ) as HTMLInputElement;
    expect(restoredAfterFilter).not.toBe(draftAfterSort);
    expect(restoredAfterFilter.value).toBe('Paid by card');

    const removedSignal = latestSignals.get('1002')!;
    const removedSetter = latestDraftSetters.get('1002')!;
    const remove = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remove 1002'
    ) as HTMLButtonElement;
    remove.click();
    flushScheduler();

    expect(container.querySelector('[data-order-id="1002"]')).toBeNull();
    expect(removedSignal.aborted).toBe(true);

    removedSetter('stale removed draft');
    const restore = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Restore orders'
    ) as HTMLButtonElement;
    restore.click();
    flushScheduler();

    const restoredAfterRemove = container.querySelector(
      '[aria-label="Note for 1002"]'
    ) as HTMLInputElement;
    expect(restoredAfterRemove).not.toBe(restoredAfterFilter);
    expect(restoredAfterRemove.value).toBe('Paid by card');
  });
});
