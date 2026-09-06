import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { Show } from '../../../src/control';
import { derive } from '../../../src/runtime/reactivity/derive';
import { resource } from '../../../src/runtime/operations';
import { state, type StateSetter } from '../../../src/runtime/reactivity/state';
import { navigate } from '../../../src/router/navigate';
import { group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

type Submission = {
  name: string;
  token: number;
};

type SubmissionResult = {
  id: string;
};

describe('routed account form submit app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/accounts/new');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should keep a pending form submission inert after navigation removes its derived preview', async () => {
    const submitRequest = createControlledDeferred<SubmissionResult>();
    let submitSignal: AbortSignal | undefined;
    let submitStarts = 0;
    let inputEvents = 0;
    let dashboardRenders = 0;
    let staleNameSetter: StateSetter<string> | undefined;

    function AccountForm() {
      const name = state('');
      const submission = state<Submission | null>(null);
      const preview = derive(() =>
        name().trim() ? `Account preview: ${name().trim()}` : 'Account preview'
      );
      const result = resource<SubmissionResult | null>(
        ({ signal }) => {
          const currentSubmission = submission();
          if (!currentSubmission) {
            return null;
          }

          submitStarts += 1;
          submitSignal = signal;
          return submitRequest.promise;
        },
        [submission()?.token ?? 0]
      );
      staleNameSetter = name.set;

      return (
        <form
          aria-label="Create account"
          onSubmit={(event: Event) => {
            event.preventDefault();
            submission.set({ name: name(), token: 1 });
          }}
        >
          <label>
            Account name
            <input
              aria-label="Account name"
              value={name()}
              onInput={(event: Event) => {
                inputEvents += 1;
                name.set((event.target as HTMLInputElement).value);
              }}
            />
          </label>
          <p aria-label="Account preview">{preview()}</p>
          <button type="submit">Create account</button>
          <Show
            when={() => submission() !== null && result.pending}
            fallback={
              <p aria-label="Submission result">
                {result.value ? `Created ${result.value.id}` : 'Ready'}
              </p>
            }
          >
            <p role="status">Saving account...</p>
          </Show>
        </form>
      );
    }

    function AppShell({ children }: { children?: unknown }) {
      return (
        <main>
          <nav aria-label="Primary navigation">Accounts</nav>
          {children as never}
        </main>
      );
    }

    group({ layout: AppShell }, () => {
      route('/accounts/new', AccountForm);
      route('/dashboard', () => {
        dashboardRenders += 1;
        return <section aria-label="Dashboard">Dashboard</section>;
      });
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(container.innerHTML).toContain('Account name');
    const input = container.querySelector(
      '[aria-label="Account name"]'
    ) as HTMLInputElement;
    input.value = 'Ada Labs';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    expect(
      container.querySelector('[aria-label="Account preview"]')?.textContent
    ).toBe('Account preview: Ada Labs');

    (container.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    flushScheduler();

    expect(submitStarts).toBe(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Saving account...'
    );

    navigate('/dashboard');
    flushScheduler();
    const rendersAfterNavigation = dashboardRenders;
    const eventsAfterNavigation = inputEvents;

    expect(submitSignal?.aborted).toBe(true);
    expect(container.querySelector('[aria-label="Dashboard"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Create account"]')).toBeNull();

    input.value = 'Late event';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    staleNameSetter?.('Late setter');
    submitRequest.resolve({ id: 'account-42' });
    await settleAsyncWork();

    expect(inputEvents).toBe(eventsAfterNavigation);
    expect(dashboardRenders).toBe(rendersAfterNavigation);
    expect(container.querySelector('[aria-label="Dashboard"]')).not.toBeNull();
    expect(container.textContent).not.toContain('account-42');
    expect(container.textContent).not.toContain('Late');
  });
});
