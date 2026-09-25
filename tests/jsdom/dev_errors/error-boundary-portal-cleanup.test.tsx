import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import { For, Show } from '../../../src/control';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { task } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

type Row = { id: number };

async function settle(): Promise<void> {
  flushScheduler();
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
  flushScheduler();
}

describe('ErrorBoundary portal cleanup', () => {
  let { container, cleanup } = createTestContainer();
  let cleanups: string[];
  let fail: State<boolean>;
  let resetKey: State<number>;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
    cleanups = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function PortalContent(props: { label: string }) {
    task(() => () => {
      cleanups.push(props.label);
    });
    return <aside data-portal-content={props.label}>{props.label}</aside>;
  }

  // Fresh component functions per mount: reactive prop bindings rendered by a
  // component function reused across islands do not re-run in later islands.
  function createFailures() {
    function RenderFailure() {
      if (fail()) {
        throw new Error('render failed');
      }
      return <p>{'ok'}</p>;
    }

    function BindingFailure() {
      return (
        <p
          title={() => {
            if (fail()) {
              throw new Error('binding failed');
            }
            return 'ok';
          }}
        >
          {'bound'}
        </p>
      );
    }

    function ControlFailure() {
      return (
        <ul>
          <For
            each={() =>
              (fail()
                ? [{ id: 1 }, { id: 1 }]
                : [{ id: 1 }, { id: 2 }]) as Row[]
            }
            by={(row) => row.id}
          >
            {(row) => <li>{String(row.id)}</li>}
          </For>
        </ul>
      );
    }

    return {
      render: RenderFailure,
      binding: BindingFailure,
      control: ControlFailure,
    } as const;
  }

  type FailureKind = keyof ReturnType<typeof createFailures>;

  function mountDefaultPortalWriter(
    kind: FailureKind,
    options: { outerWriter?: boolean } = {}
  ): void {
    const Failure = createFailures()[kind];

    function Writer() {
      task(() => () => {
        cleanups.push('writer');
      });
      return (
        <div>
          <Portal>
            <PortalContent label="inner" />
          </Portal>
          <Failure />
        </div>
      );
    }

    function OuterWriter() {
      return (
        <Portal>
          <PortalContent label="outer" />
        </Portal>
      );
    }

    const App = () => {
      fail = state(false);
      resetKey = state(0);
      return (
        <div>
          <DefaultPortal />
          {options.outerWriter ? <OuterWriter /> : null}
          <ErrorBoundary
            resetKey={resetKey()}
            fallback={<p id="fallback">{'fallback'}</p>}
          >
            <Writer />
          </ErrorBoundary>
        </div>
      );
    };

    createIsland({ root: container, component: App });
  }

  function portalContent(label: string): Element | null {
    return container.querySelector(`[data-portal-content="${label}"]`);
  }

  describe.each(['render', 'binding', 'control'] as const)(
    'default portal, %s error',
    (kind) => {
      it('should remove the failed writer portal content and run its cleanups', async () => {
        mountDefaultPortalWriter(kind);
        await settle();
        expect(portalContent('inner')).not.toBeNull();

        fail.set(true);
        await settle();

        expect(container.querySelector('#fallback')).not.toBeNull();
        expect(portalContent('inner')).toBeNull();
        expect(cleanups.sort()).toEqual(['inner', 'writer']);
      });

      it('should re-write the portal when resetKey recovers the boundary', async () => {
        mountDefaultPortalWriter(kind);
        await settle();

        fail.set(true);
        await settle();
        expect(portalContent('inner')).toBeNull();

        fail.set(false);
        resetKey.set(1);
        await settle();

        expect(container.querySelector('#fallback')).toBeNull();
        expect(portalContent('inner')).not.toBeNull();
        expect(container.querySelectorAll('[data-portal-content]').length).toBe(
          1
        );
      });
    }
  );

  it('should clean up a writer without DOM of its own whose re-render failed', async () => {
    // The writer renders only the portal, so it shares the boundary's host.
    function Writer() {
      task(() => () => {
        cleanups.push('writer');
      });
      if (fail()) {
        throw new Error('writer failed');
      }
      return (
        <Portal>
          <PortalContent label="inner" />
        </Portal>
      );
    }

    const App = () => {
      fail = state(false);
      resetKey = state(0);
      return (
        <div>
          <DefaultPortal />
          <ErrorBoundary
            resetKey={resetKey()}
            fallback={<p id="fallback">{'fallback'}</p>}
          >
            <Writer />
          </ErrorBoundary>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    await settle();
    expect(portalContent('inner')).not.toBeNull();

    fail.set(true);
    await settle();

    expect(container.querySelector('#fallback')).not.toBeNull();
    expect(portalContent('inner')).toBeNull();
    expect(cleanups.sort()).toEqual(['inner', 'writer']);

    fail.set(false);
    resetKey.set(1);
    await settle();

    expect(container.querySelector('#fallback')).toBeNull();
    expect(container.querySelectorAll('[data-portal-content]').length).toBe(1);
  });

  it('should remove portal content whose own post-mount render failed', async () => {
    let setBroken!: (value: boolean) => void;

    function StatefulContent() {
      const broken = state(false);
      setBroken = broken.set;
      task(() => () => {
        cleanups.push('content');
      });
      if (broken()) {
        throw new Error('content failed');
      }
      return <aside data-portal-content="content">{'content'}</aside>;
    }

    // The writer renders no DOM of its own, so it shares the boundary's host.
    function Writer() {
      task(() => () => {
        cleanups.push('writer');
      });
      return (
        <Portal>
          <StatefulContent />
        </Portal>
      );
    }

    let reset!: () => void;
    const App = () => (
      <div>
        <DefaultPortal />
        <ErrorBoundary
          fallback={(_error, nextReset) => {
            reset = nextReset;
            return <p id="fallback">{'fallback'}</p>;
          }}
        >
          <Writer />
        </ErrorBoundary>
      </div>
    );

    createIsland({ root: container, component: App });
    await settle();
    expect(portalContent('content')).not.toBeNull();

    setBroken(true);
    await settle();

    expect(container.querySelector('#fallback')).not.toBeNull();
    expect(portalContent('content')).toBeNull();
    expect(cleanups.sort()).toEqual(['content', 'writer']);

    reset();
    await settle();

    expect(container.querySelector('#fallback')).toBeNull();
    expect(portalContent('content')).not.toBeNull();
  });

  it.each(['direct child', 'inside Show', 'inside a component'] as const)(
    'should keep a host discarded by a boundary fallback from moving content to the automatic host (%s)',
    async (placement) => {
      const Failure = createFailures().render;

      function Layer() {
        return <DefaultPortal />;
      }

      const renderHost = () =>
        placement === 'direct child' ? (
          <DefaultPortal />
        ) : placement === 'inside Show' ? (
          <Show when={() => true}>{() => <DefaultPortal />}</Show>
        ) : (
          <Layer />
        );

      function Writer() {
        return (
          <Portal>
            <PortalContent label="content" />
          </Portal>
        );
      }

      const App = () => {
        fail = state(false);
        resetKey = state(0);
        return (
          <div>
            <Writer />
            <section id="host-area">
              <ErrorBoundary
                resetKey={resetKey()}
                fallback={<p id="fallback">{'fallback'}</p>}
              >
                {renderHost()}
                <Failure />
              </ErrorBoundary>
            </section>
          </div>
        );
      };

      createIsland({ root: container, component: App });
      await settle();
      expect(
        container.querySelector('#host-area [data-portal-content="content"]')
      ).not.toBeNull();

      fail.set(true);
      await settle();
      expect(container.querySelector('#fallback')).not.toBeNull();
      expect(portalContent('content')).toBeNull();

      fail.set(false);
      resetKey.set(1);
      await settle();
      expect(
        container.querySelector('#host-area [data-portal-content="content"]')
      ).not.toBeNull();
      expect(container.querySelectorAll('[data-portal-content]').length).toBe(
        1
      );
    }
  );

  it('should release the slot owned by the failed writer while another writer is live', async () => {
    mountDefaultPortalWriter('render', { outerWriter: true });
    await settle();
    expect(portalContent('inner')).not.toBeNull();
    expect(portalContent('outer')).toBeNull();

    fail.set(true);
    await settle();

    // Handing the slot to another writer is the multi-writer design (#495);
    // releasing it matches an ordinary writer unmount.
    expect(container.querySelector('#fallback')).not.toBeNull();
    expect(container.querySelectorAll('[data-portal-content]').length).toBe(0);
    expect(cleanups.sort()).toEqual(['inner', 'writer']);
  });

  it('should keep the default portal released after the boundary is removed', async () => {
    let show!: State<boolean>;
    const Failure = createFailures().render;

    function Writer() {
      return (
        <div>
          <Portal>
            <PortalContent label="inner" />
          </Portal>
          <Failure />
        </div>
      );
    }

    const App = () => {
      fail = state(false);
      show = state(true);
      return (
        <div>
          <DefaultPortal />
          <Show when={() => show()}>
            {() => (
              <ErrorBoundary fallback={<p id="fallback">{'fallback'}</p>}>
                <Writer />
              </ErrorBoundary>
            )}
          </Show>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    await settle();
    fail.set(true);
    await settle();
    show.set(false);
    await settle();

    expect(portalContent('inner')).toBeNull();
    expect(cleanups).toEqual(['inner']);
  });
});
