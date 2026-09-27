import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { getSignal } from '../../../src/resources';
import { state, type State } from '../../../src/index';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('component ownership across replacement', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let reportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Rollback cleanup failures are reported without replacing the
    // creation failure.
    reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(async () => {
    cleanup();
    _resetDefaultPortal();
    await Promise.resolve();
    vi.unstubAllGlobals();
  });

  it('should clean an outgoing descendant before an incoming top owner writes its portal', () => {
    let replace!: State<boolean>;
    let outgoingAborts = 0;

    function OutgoingPortalOwner() {
      getSignal().addEventListener('abort', () => {
        outgoingAborts += 1;
      });
      Portal({
        children: <aside data-portal={'outgoing'}>{'outgoing portal'}</aside>,
      });
      return <span data-descendant={'outgoing'}>{'outgoing'}</span>;
    }

    function ReplacingOwner({ incoming }: { incoming: boolean }) {
      if (incoming) {
        Portal({
          children: <aside data-portal={'incoming'}>{'incoming portal'}</aside>,
        });
        return <article data-root={'incoming'}>{'incoming'}</article>;
      }

      return (
        <button data-root={'outgoing'}>
          <OutgoingPortalOwner />
        </button>
      );
    }

    function App(): JSXElement {
      replace = state(false);
      return (
        <main>
          <ReplacingOwner incoming={replace()} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const outgoingRoot = container.querySelector('[data-root="outgoing"]')!;
    expect(container.querySelector('[data-portal="outgoing"]')).not.toBeNull();

    replace.set(true);
    flushScheduler();

    expect(outgoingRoot.isConnected).toBe(false);
    expect(container.querySelector('[data-root="incoming"]')).not.toBeNull();
    expect(container.querySelector('[data-portal="outgoing"]')).toBeNull();
    expect(container.querySelector('[data-portal="incoming"]')).not.toBeNull();
    expect(outgoingAborts).toBe(1);
  });

  it('should retain reused wrapper-chain owners across text updates', () => {
    let label!: State<string>;
    let nestedAborts = 0;
    const nestedSignals: AbortSignal[] = [];

    function NestedText({ value }: { value: string }) {
      const signal = getSignal();
      if (!nestedSignals.includes(signal)) {
        nestedSignals.push(signal);
        signal.addEventListener('abort', () => {
          nestedAborts += 1;
        });
      }
      return value;
    }

    function WrapperOwner({ value }: { value: string }) {
      return <NestedText value={value} />;
    }

    function App(): JSXElement {
      label = state('first');
      return (
        <main>
          <WrapperOwner value={label()} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toContain('first');
    expect(nestedSignals).toHaveLength(1);

    label.set('second');
    flushScheduler();

    expect(container.textContent).toContain('second');
    expect(nestedSignals).toHaveLength(1);
    expect(nestedAborts).toBe(0);
  });
});
