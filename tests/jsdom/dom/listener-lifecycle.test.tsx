// tests/dom/listener_lifecycle.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createRef, state } from '../../../src/index';
import { on } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/runtime/events';

describe('listener lifecycle (DOM)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => {
    enableEventDelegation();
    cleanup();
  });

  it('should add event listener once when component mounts', async () => {
    let clicks = 0;
    let tick: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      tick = state(0);
      return (
        <button
          id={'btn'}
          onClick={() => {
            clicks++;
          }}
        >{`${tick()}`}</button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(clicks).toBe(1);

    // Re-render without changing handler should not duplicate listener.
    tick!.set(1);
    flushScheduler();
    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(clicks).toBe(2);
  });

  it('should remove listener when component unmounts', async () => {
    let clicks = 0;
    const With = () => (
      <button id={'btn'} onClick={() => (clicks += 1)}>
        {'x'}
      </button>
    );
    const Without = () => <div>{'gone'}</div>;

    createIsland({ root: container, component: With });
    flushScheduler();
    const old = container.querySelector('#btn') as HTMLButtonElement;

    old.click();
    expect(clicks).toBe(1);

    createIsland({ root: container, component: Without });
    flushScheduler();
    expect(container.querySelector('#btn')).toBeNull();

    // Spec: unmount disposes event resources.
    old.click();
    expect(clicks).toBe(1);
  });

  it('should replace listener when handler changes', async () => {
    let mode: ReturnType<typeof state<'a' | 'b'>> | null = null;
    let aClicks = 0;
    let bClicks = 0;

    const Component = () => {
      mode = state<'a' | 'b'>('a');
      return (
        <button
          id={'btn'}
          onClick={() => {
            if (mode!() === 'a') aClicks++;
            else bClicks++;
          }}
        >
          {mode()}
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(aClicks).toBe(1);
    expect(bClicks).toBe(0);

    mode!.set('b');
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(aClicks).toBe(1);
    expect(bClicks).toBe(1);
  });

  it('should resolve lazy listener targets during client commit', () => {
    const target = new EventTarget();
    let resolveCalls = 0;
    let calls = 0;

    const Component = () => {
      on(
        () => {
          resolveCalls += 1;
          return target;
        },
        'ready',
        () => {
          calls += 1;
        }
      );
      return <div>{'ready'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(resolveCalls).toBeGreaterThan(0);
    target.dispatchEvent(new Event('ready'));
    expect(calls).toBe(1);
  });

  it('should provide stable refs and clear them on unmount', () => {
    const ref = createRef<HTMLButtonElement>();

    createIsland({
      root: container,
      component: () => <button ref={ref}>{'button'}</button>,
    });
    flushScheduler();

    expect(ref.current).toBe(container.querySelector('button'));
    createIsland({ root: container, component: () => <div>{'gone'}</div> });
    flushScheduler();
    expect(ref.current).toBeNull();
  });

  it('should update direct listeners in place when delegation is disabled', async () => {
    disableEventDelegation();

    let mode: ReturnType<typeof state<'a' | 'b'>> | null = null;
    const calls: string[] = [];

    const addSpy = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removeSpy = vi.spyOn(EventTarget.prototype, 'removeEventListener');

    const Component = () => {
      mode = state<'a' | 'b'>('a');
      return (
        <button id={'btn'} onClick={() => calls.push(mode!())}>
          {mode!()}
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const baselineAdds = addSpy.mock.calls.filter(
      ([eventName]) => eventName === 'click'
    ).length;
    const baselineRemoves = removeSpy.mock.calls.filter(
      ([eventName]) => eventName === 'click'
    ).length;

    mode!.set('b');
    flushScheduler();

    const afterAdds = addSpy.mock.calls.filter(
      ([eventName]) => eventName === 'click'
    ).length;
    const afterRemoves = removeSpy.mock.calls.filter(
      ([eventName]) => eventName === 'click'
    ).length;

    expect(afterAdds).toBe(baselineAdds);
    expect(afterRemoves).toBe(baselineRemoves);

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(calls).toEqual(['b']);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('should replace a direct listener with a delegated listener when delegation is re-enabled', async () => {
    disableEventDelegation();

    let mode: ReturnType<typeof state<'a' | 'b'>> | null = null;
    const calls: string[] = [];

    const Component = () => {
      mode = state<'a' | 'b'>('a');
      return (
        <button id={'btn'} onClick={() => calls.push(mode!())}>
          {mode!()}
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    enableEventDelegation();
    mode!.set('b');
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();

    expect(calls).toEqual(['b']);
  });
});
