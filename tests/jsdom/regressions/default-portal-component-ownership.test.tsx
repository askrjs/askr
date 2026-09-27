import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Show } from '../../../src/control';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
  definePortal,
  type PortalProps,
} from '../../../src/foundations/structures/portal';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { task } from '../../../src/resources';
import { state, type State } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  resetRouteState,
  routeRegistryFromTable,
} from '../../router-test-utils';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

function resetExecutionModel(): void {
  delete (globalThis as unknown as Record<string | symbol, unknown>)[
    EXECUTION_MODEL_KEY
  ];
}

describe('default portal component ownership', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    resetExecutionModel();
    resetRouteState();
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
    resetRouteState();
    resetExecutionModel();
  });

  it('should retain a bare component child rendered by an explicit host', () => {
    function Leaf(props: { count: State<number> }) {
      return <span data-portal-count={'true'}>{`count=${props.count()}`}</span>;
    }

    function App() {
      const count = state(0);

      return (
        <>
          <button onClick={() => count.set((value) => value + 1)}>
            {'increment'}
          </button>
          <Portal>
            <Leaf count={count} />
          </Portal>
          <aside>
            <DefaultPortal />
          </aside>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(container.querySelector('[data-portal-count]')?.textContent).toBe(
      'count=0'
    );

    for (let count = 1; count <= 3; count += 1) {
      button.click();
      flushScheduler();
      expect(container.querySelector('[data-portal-count]')?.textContent).toBe(
        `count=${count}`
      );
    }
  });

  it('should retain a bare component child after hydration', async () => {
    function Leaf(props: { count: State<number> }) {
      return <span data-portal-count={'true'}>{`count=${props.count()}`}</span>;
    }

    function App() {
      const count = state(0);

      return (
        <>
          <button onClick={() => count.set((value) => value + 1)}>
            {'increment'}
          </button>
          <Portal>
            <Leaf count={count} />
          </Portal>
          <aside>
            <DefaultPortal />
          </aside>
        </>
      );
    }

    container.innerHTML = renderToStringSync(App);
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      hydrate: { verifyMarkup: false },
    });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(container.querySelector('[data-portal-count]')?.textContent).toBe(
      'count=0'
    );

    for (let count = 1; count <= 3; count += 1) {
      button.click();
      flushScheduler();
      expect(container.querySelector('[data-portal-count]')?.textContent).toBe(
        `count=${count}`
      );
    }
  });

  it('should preserve a nested portal across repeated Show toggles', async () => {
    let setOpen!: (open: boolean) => void;
    let setVersion!: (version: number) => void;
    let nestedPortalCleanups = 0;
    const NestedPortalHost = definePortal();

    function NestedPortal(props: PortalProps) {
      task(() => () => {
        nestedPortalCleanups += 1;
        NestedPortalHost.render({ children: undefined });
      });
      return NestedPortalHost.render({ children: props.children }) as null;
    }

    function Surface(props: { version: number }) {
      return (
        <section
          data-nested-portal={'true'}
        >{`version=${props.version}`}</section>
      );
    }

    function App() {
      const open = state(true);
      const version = state(0);
      setOpen = open.set;
      setVersion = version.set;

      return (
        <>
          <Portal>
            <Show when={open}>
              <NestedPortal>
                <Surface version={version()} />
              </NestedPortal>
            </Show>
          </Portal>
          <aside>
            <DefaultPortal />
          </aside>
          <div data-nested-portal-host={'true'}>
            <NestedPortalHost />
          </div>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelectorAll('[data-nested-portal]')).toHaveLength(1);
    expect(container.querySelector('[data-nested-portal]')?.textContent).toBe(
      'version=0'
    );

    for (let version = 1; version <= 10; version += 1) {
      setOpen(false);
      setVersion(version);
      flushScheduler();
      expect(nestedPortalCleanups).toBe(version);
      expect(container.querySelectorAll('[data-nested-portal]')).toHaveLength(
        0
      );

      setOpen(true);
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.querySelectorAll('[data-nested-portal]')).toHaveLength(
        1
      );
      expect(container.querySelector('[data-nested-portal]')?.textContent).toBe(
        `version=${version}`
      );
    }
  });

  it('should release an explicit host unmounted in the flush that mounted it', () => {
    let show!: State<boolean>;

    function Toggler() {
      show = state(false);
      return (
        <main>
          <Show when={show}>
            <div>
              <DefaultPortal />
              <span ref={(el) => el && show.set(false)} />
            </div>
          </Show>
        </main>
      );
    }

    function App() {
      return (
        <>
          <Toggler />
          <Portal>
            <b>content</b>
          </Portal>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.innerHTML).toContain('<b>content</b>');

    show.set(true);
    flushScheduler();
    flushScheduler();

    expect(container.querySelector('main')?.innerHTML).toBe('');
    expect(container.innerHTML).toContain('<b>content</b>');
  });
});
