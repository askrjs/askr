import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../../src/foundations/structures/portal';
import { For } from '../../../../src/control';
import { resource } from '../../../../src/runtime/operations';
import { state } from '../../../../src/runtime/reactivity/state';
import { createIsland } from '../../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';
import {
  createControlledDeferred,
  settleAsyncWork,
} from '../../app-flows/helpers';

type Item = {
  id: string;
  label: string;
};

describe('portal async parent update regression', () => {
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

  it('should not leave a stale portaled instance after parent async data resolves', async () => {
    const request = createControlledDeferred<Item[]>();

    function SearchableList(props: { items: Item[] }) {
      const filter = state('');
      const matches = state<Item[]>([]);

      return (
        <section
          data-testid="portal-list"
          data-item-count={String(props.items.length)}
          data-match-count={String(matches().length)}
        >
          <input
            aria-label="Filter"
            value={filter()}
            onInput={(event: Event) => {
              const value = (event.target as HTMLInputElement).value;
              filter.set(value);
              matches.set(
                props.items.filter((item) => item.label.includes(value))
              );
            }}
          />
          <ul>
            <For each={props.items} by={(item) => item.id}>
              {(item) => <li>{item.label}</li>}
            </For>
          </ul>
        </section>
      );
    }

    function Page() {
      const query = resource<Item[]>(() => request.promise);
      const items = query.value ?? [];

      return (
        <>
          <Portal>
            <SearchableList items={items} />
          </Portal>
          <main>{'content'}</main>
        </>
      );
    }

    function Shell() {
      return (
        <>
          <aside aria-label="Sidebar">
            <DefaultPortal />
          </aside>
          <Page />
        </>
      );
    }

    createIsland({ root: container, component: Shell });
    flushScheduler();

    expect(
      container.querySelectorAll('[data-testid="portal-list"]')
    ).toHaveLength(1);
    expect(
      container
        .querySelector('[data-testid="portal-list"]')
        ?.getAttribute('data-item-count')
    ).toBe('0');

    request.resolve([{ id: 'customer-1', label: 'Ada Lovelace' }]);
    await settleAsyncWork();

    expect(
      container.querySelectorAll('[data-testid="portal-list"]')
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('input[aria-label="Filter"]')
    ).toHaveLength(1);

    const input = container.querySelector(
      'input[aria-label="Filter"]'
    ) as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const list = container.querySelector('[data-testid="portal-list"]');
    expect(list?.getAttribute('data-item-count')).toBe('1');
    expect(list?.getAttribute('data-match-count')).toBe('1');
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });

  it('should restore the automatic fallback host when an explicit host unmounts', () => {
    function App() {
      const showExplicitHost = state(true);

      return (
        <>
          <button type="button" onClick={() => showExplicitHost.set(false)}>
            {'hide host'}
          </button>
          {showExplicitHost() ? (
            <aside aria-label="Sidebar">
              <DefaultPortal />
            </aside>
          ) : null}
          <Portal>
            <div data-testid="portal-surface">{'floating'}</div>
          </Portal>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(
      container.querySelectorAll('[data-testid="portal-surface"]')
    ).toHaveLength(1);
    expect(
      container.querySelector('aside [data-testid="portal-surface"]')
    ).not.toBeNull();

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.querySelector('aside')).toBeNull();
    expect(
      container.querySelectorAll('[data-testid="portal-surface"]')
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="portal-surface"]')?.textContent
    ).toBe('floating');
  });
});
