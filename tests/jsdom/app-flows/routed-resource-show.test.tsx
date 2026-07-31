import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { Show } from '../../../src/control';
import { resource } from '../../../src/runtime/operations';
import { navigate } from '../../../src/router/navigate';
import { group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

type Customer = {
  id: string;
  name: string;
};

describe('routed resource loading app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/customers/42');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should keep a late customer response out of a route that replaced its loading branch', async () => {
    const customerRequest = createControlledDeferred<Customer>();
    let customerSignal: AbortSignal | undefined;

    function CustomerPage() {
      const customer = resource<Customer>(({ signal }) => {
        customerSignal = signal;
        return customerRequest.promise;
      });

      return (
        <section aria-label="Customer profile">
          <Show
            when={() => customer.pending}
            fallback={
              <article aria-label="Customer details">
                {customer.value?.name ?? 'Missing customer'}
              </article>
            }
          >
            <p role="status">Loading customer...</p>
          </Show>
        </section>
      );
    }

    function AppShell({ children }: { children?: unknown }) {
      return (
        <main>
          <nav aria-label="Primary navigation">CRM</nav>
          {children as never}
        </main>
      );
    }

    group({ layout: AppShell }, () => {
      route('/customers/{id}', CustomerPage);
      route('/settings', () => (
        <section aria-label="Settings">Settings</section>
      ));
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const shell = container.querySelector('main');
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Loading customer...'
    );

    navigate('/settings');
    flushScheduler();

    expect(container.querySelector('main')).toBe(shell);
    expect(container.querySelector('[aria-label="Settings"]')).not.toBeNull();
    expect(customerSignal?.aborted).toBe(true);

    customerRequest.resolve({ id: '42', name: 'Ada Lovelace' });
    await settleAsyncWork();

    expect(container.querySelector('[aria-label="Settings"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Ada Lovelace');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
