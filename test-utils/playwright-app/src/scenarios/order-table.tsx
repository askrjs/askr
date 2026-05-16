/** @jsxImportSource @askrjs/askr */

import { derive, state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';
import { createIsland } from '@askrjs/askr/boot';

type OrderStatus = 'Open' | 'Paid' | 'Canceled';

type Order = {
  id: string;
  customer: string;
  city: string;
  status: OrderStatus;
  total: number;
  note: string;
};

const initialOrders: Order[] = [
  {
    id: '1001',
    customer: 'Northwind Traders',
    city: 'Seattle',
    status: 'Open',
    total: 1280,
    note: 'Ready to invoice',
  },
  {
    id: '1002',
    customer: 'Acme Corp',
    city: 'Austin',
    status: 'Paid',
    total: 940,
    note: 'Paid by card',
  },
  {
    id: '1003',
    customer: 'Globex',
    city: 'Chicago',
    status: 'Open',
    total: 1625,
    note: 'Needs approval',
  },
  {
    id: '1004',
    customer: 'Umbrella Supply',
    city: 'Denver',
    status: 'Canceled',
    total: 410,
    note: 'Canceled by customer',
  },
];

function cloneOrders(): Order[] {
  return initialOrders.map((order) => ({ ...order }));
}

function textFrom(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function formatCurrency(total: number): string {
  return `$${total.toLocaleString('en-US')}`;
}

function OrderRow({
  order,
  selected,
  onSelect,
  onRemove,
}: {
  order: Order;
  selected: boolean;
  onSelect(): void;
  onRemove(): void;
}) {
  const [note, setNote] = state(order.note);

  return (
    <tr aria-selected={String(selected)} class={selected ? 'selected' : ''}>
      <td>{order.id}</td>
      <td>{order.customer}</td>
      <td>{order.city}</td>
      <td>{order.status}</td>
      <td>{formatCurrency(order.total)}</td>
      <td>
        <label>
          Note for order {order.id}
          <input
            type="text"
            value={note()}
            onInput={(event: Event) => setNote(textFrom(event))}
          />
        </label>
      </td>
      <td>
        <button type="button" onClick={onSelect}>
          Select order {order.id}
        </button>
        <button type="button" onClick={onRemove}>
          Remove order {order.id}
        </button>
      </td>
    </tr>
  );
}

function OrderManagementTable() {
  const [orders, setOrders] = state(cloneOrders());
  const [query, setQuery] = state('');
  const [status, setStatus] = state<'all' | OrderStatus>('all');
  const [sortAscending, setSortAscending] = state(true);
  const [selectedId, setSelectedId] = state<string | null>(null);

  const visibleOrders = derive(() => {
    const normalizedQuery = query().trim().toLowerCase();
    const visible = orders().filter((order) => {
      const matchesStatus = status() === 'all' || order.status === status();
      const matchesQuery =
        !normalizedQuery ||
        order.customer.toLowerCase().includes(normalizedQuery) ||
        order.city.toLowerCase().includes(normalizedQuery) ||
        order.id.includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });

    return visible
      .slice()
      .sort((left, right) =>
        sortAscending() ? left.total - right.total : right.total - left.total
      );
  });

  const restoreOrders = () => {
    setOrders(cloneOrders());
    setSelectedId(null);
    setQuery('');
    setStatus('all');
    setSortAscending(true);
  };

  return (
    <section aria-label="Order management">
      <h2>Order management</h2>
      <form aria-label="Order filters">
        <label>
          Filter orders
          <input
            type="search"
            value={query()}
            onInput={(event: Event) => setQuery(textFrom(event))}
          />
        </label>
        <label>
          Status
          <select
            value={status()}
            onChange={(event: Event) =>
              setStatus(textFrom(event) as 'all' | OrderStatus)
            }
          >
            <option value="all">All statuses</option>
            <option value="Open">Open</option>
            <option value="Paid">Paid</option>
            <option value="Canceled">Canceled</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Sort by total"
          onClick={() => setSortAscending((current) => !current)}
        >
          Sort by total {sortAscending() ? 'descending' : 'ascending'}
        </button>
        <button type="button" onClick={() => setOrders([])}>
          Clear orders
        </button>
        <button type="button" onClick={restoreOrders}>
          Restore orders
        </button>
      </form>

      <table>
        <caption>Orders</caption>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>City</th>
            <th>Status</th>
            <th>Total</th>
            <th>Note</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <For
            each={visibleOrders()}
            by={(order) => order.id}
            fallback={
              <tr>
                <td colSpan={7}>No orders found.</td>
              </tr>
            }
          >
            {(order) => (
              <OrderRow
                order={order}
                selected={selectedId() === order.id}
                onSelect={() => setSelectedId(order.id)}
                onRemove={() =>
                  setOrders((current) =>
                    current.filter((candidate) => candidate.id !== order.id)
                  )
                }
              />
            )}
          </For>
        </tbody>
      </table>
      <p aria-label="Selected order">
        {selectedId()
          ? `Selected order ${selectedId()}.`
          : 'No order selected.'}
      </p>
    </section>
  );
}

export function mountOrderTableScenario(root: HTMLElement): void {
  createIsland({ root, component: OrderManagementTable });
}
