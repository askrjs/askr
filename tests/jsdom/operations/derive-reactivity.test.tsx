import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { createIsland, derive, state } from '../../../src/index';
import { For } from '../../../src/control';
import { cleanupComponent } from '../../../src/runtime/component';
import { renderToStringSync } from '../../../src/ssr';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { allowFrameworkWarnings } from '../../setup-env';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

describe('derive reactivity', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as unknown as Record<string | symbol, unknown>)[
      EXECUTION_MODEL_KEY
    ];
  });

  it('should suppress downstream reactive prop updates when the projection is unchanged', () => {
    let countState!: ReturnType<typeof state<number>>;
    let propEvaluations = 0;

    const App = () => {
      countState = state(0);
      const parity = derive(() => (countState() % 2 === 0 ? 'even' : 'odd'));

      return (
        <div
          id="subject"
          data-parity={() => {
            propEvaluations += 1;
            return parity();
          }}
        />
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    propEvaluations = 0;
    countState.set(2);
    flushScheduler();

    expect(
      container.querySelector('#subject')?.getAttribute('data-parity')
    ).toBe('even');
    expect(propEvaluations).toBe(0);
  });

  it('should notify downstream readers only when the derived value changes', () => {
    let countState!: ReturnType<typeof state<number>>;
    let propEvaluations = 0;

    const App = () => {
      countState = state(0);
      const parity = derive(() => (countState() % 2 === 0 ? 'even' : 'odd'));

      return (
        <div
          id="subject"
          data-parity={() => {
            propEvaluations += 1;
            return parity();
          }}
        />
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    propEvaluations = 0;
    countState.set(1);
    flushScheduler();

    expect(
      container.querySelector('#subject')?.getAttribute('data-parity')
    ).toBe('odd');
    expect(propEvaluations).toBe(1);
  });

  it('should propagate nested derive changes without rerendering when the outer projection is unchanged', () => {
    let countState!: ReturnType<typeof state<number>>;
    let renders = 0;

    const App = () => {
      renders += 1;
      countState = state(0);
      const parity = derive(() => countState() % 2 === 0);
      const label = derive(() => (parity() ? 'even' : 'odd'));

      return <div id="subject">{label()}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    countState.set(2);
    flushScheduler();
    expect(container.querySelector('#subject')?.textContent).toBe('even');
    expect(renders).toBe(1);

    countState.set(1);
    flushScheduler();
    expect(container.querySelector('#subject')?.textContent).toBe('odd');
    expect(renders).toBe(2);
  });

  it('should clean up derived subscriptions on unmount and For item removal', () => {
    allowFrameworkWarnings(/Unused state variable detected in App at index 1/);
    let showChild!: ReturnType<typeof state<boolean>>;
    let shared!: ReturnType<typeof state<number>>;
    let rows!: ReturnType<typeof state<Array<{ id: number; label: string }>>>;
    let selected!: ReturnType<typeof state<number | null>>;

    const Child = () => {
      const parity = derive(() => shared() % 2 === 0);
      return <div id="child">{parity() ? 'even' : 'odd'}</div>;
    };

    const Row = ({ item }: { item: { id: number; label: string } }) => {
      const isSelected = derive(selected, (value) => value === item.id);
      return (
        <div class={() => (isSelected() ? 'danger' : '')}>{item.label}</div>
      );
    };

    const App = () => {
      showChild = state(true);
      shared = state(0);
      rows = state([
        { id: 1, label: 'one' },
        { id: 2, label: 'two' },
        { id: 3, label: 'three' },
      ]);
      selected = state<number | null>(null);

      return (
        <div>
          {showChild() ? <Child /> : null}
          <section>
            {
              <For each={rows} by={(item) => item.id}>
                {(item) => <Row item={item} />}
              </For>
            }
          </section>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    type InstanceHost = Element & {
      __ASKR_INSTANCE?: import('../../../src/runtime/component').ComponentInstance;
    };
    const childHost = container.querySelector('#child') as InstanceHost | null;
    const childInstance = childHost?.__ASKR_INSTANCE ?? null;

    expect(shared._derivedSubscribers?.size ?? 0).toBe(1);
    expect(selected._derivedSubscribers?.size ?? 0).toBe(3);

    showChild.set(false);
    flushScheduler();

    if ((shared._derivedSubscribers?.size ?? 0) !== 0 && childInstance) {
      cleanupComponent(childInstance);
    }

    expect(shared._derivedSubscribers?.size ?? 0).toBe(0);

    rows.set((current) => current.slice(0, 2));
    flushScheduler();
    expect(selected._derivedSubscribers?.size ?? 0).toBe(2);
  });

  it('should enforce stable hook order for derive()', () => {
    let enabled!: ReturnType<typeof state<boolean>>;

    const App = () => {
      enabled = state(false);
      if (enabled()) {
        const derived = derive(() => 'enabled');
        derived();
      }
      const label = state('stable');
      return <div>{label()}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      enabled.set(true);
      flushScheduler();
    }).toThrow(/hook order|derive|conditionally/i);
  });

  it('should support SSR render and hydration with derived getters', async () => {
    let clicks = 0;

    const Component = () => {
      const count = state(1);
      const doubled = derive(() => count() * 2);

      return (
        <button
          id="subject"
          onClick={() => {
            clicks += doubled();
          }}
        >
          {doubled()}
        </button>
      );
    };

    const html = renderToStringSync(() => Component());
    expect(html).toContain('2');

    container.innerHTML = html;
    await hydrateSPA({
      root: container,
      routes: [{ path: '/', handler: Component }],
    });

    (container.querySelector('#subject') as HTMLButtonElement).click();
    expect(clicks).toBe(2);
    expect(container.querySelector('#subject')?.textContent).toBe('2');
  });
});
