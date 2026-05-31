import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { Show } from '../../../src/control';
import { For } from '../../../src/control/for';
import { resource } from '../../../src/runtime/operations';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

type Customer = {
  id: string;
  name: string;
};

describe('resource error recovery list app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should dispose the failed branch before mounting fresh keyed results', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const requests: Array<
      ReturnType<typeof createControlledDeferred<Customer[]>>
    > = [];
    let starts = 0;
    let selections = 0;

    function CustomerResults() {
      const customers = resource<Customer[]>(() => {
        starts += 1;
        const request = createControlledDeferred<Customer[]>();
        requests.push(request);
        return request.promise;
      });

      return (
        <section aria-label="Customer results">
          <Show
            when={() => !!customers.error}
            fallback={
              <Show
                when={() => customers.pending}
                fallback={
                  <ul aria-label="Customers">
                    <For each={customers.value ?? []} by={(item) => item.id}>
                      {(item) => (
                        <li data-customer={item.id}>
                          <span>{item.name}</span>
                          <button
                            type="button"
                            onClick={() => (selections += 1)}
                          >
                            Select
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                }
              >
                <p role="status">Loading customers...</p>
              </Show>
            }
          >
            <div role="alert">
              <span>{customers.error?.message}</span>
              <button type="button" onClick={() => customers.refresh()}>
                Retry
              </button>
            </div>
          </Show>
        </section>
      );
    }

    try {
      createIsland({ root: container, component: CustomerResults });
      flushScheduler();

      expect(starts).toBe(1);
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        'Loading customers...'
      );

      requests[0].reject(new Error('Customer lookup failed'));
      await settleAsyncWork();

      const staleRetry = container.querySelector(
        '[role="alert"] button'
      ) as HTMLButtonElement;
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Customer lookup failed'
      );

      staleRetry.click();
      flushScheduler();

      expect(starts).toBe(2);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        'Loading customers...'
      );

      staleRetry.click();
      flushScheduler();
      expect(starts).toBe(2);

      requests[1].resolve([
        { id: 'customer-1', name: 'Ada Lovelace' },
        { id: 'customer-2', name: 'Grace Hopper' },
      ]);
      await settleAsyncWork();

      const rows = container.querySelectorAll('[data-customer]');
      expect(rows).toHaveLength(2);
      expect(container.textContent).toContain('Ada Lovelace');
      expect(container.textContent).toContain('Grace Hopper');

      (rows[0].querySelector('button') as HTMLButtonElement).click();
      flushScheduler();
      expect(selections).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
