// tests/state/hook_order_enforcement.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { derive, For, state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('hook order enforcement (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should enforce same order for state calls every render', () => {
    let flip: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      flip = state(false);
      if (flip()) {
        state('extra');
      }
      const a = state('a');
      const b = state('b');
      return (
        <div>
          {a()}
          {b()}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Toggle introduces a hook-order mismatch.
    // When flip is set to true, the re-render will try to call state() in a different order.
    try {
      flip!.set(true);
      // If we get here, no error was thrown - that's a test failure
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // Hook order violation should be detected and throw
    expect(error?.message).toMatch(/hook order|conditionally/i);

    expect(() => {
      flip!.set(false);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('ab');
  });

  it('should throw invariant error when state() is called conditionally', () => {
    let flag: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      flag = state(false);
      if (flag()) {
        state(123);
      }
      return <div>ok</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Initial state is fine - flag is false, so conditional state not called
    try {
      flag!.set(true);
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // When the conditional branch turns on, the hook order error should occur
    expect(error?.message).toMatch(
      /conditionally|hook order|State index violation/i
    );

    expect(() => {
      flag!.set(false);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('ok');
  });

  it('should throw invariant error when state() is called in loops', () => {
    let shouldLoop: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      shouldLoop = state(false);

      // State in a conditional loop - loop count can change
      if (shouldLoop()) {
        for (let i = 0; i < 3; i++) {
          state(i);
        }
      }

      return <div>x</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // First render: loop doesn't run, state calls: [0]
    // Toggle to enable loop
    try {
      shouldLoop!.set(true);
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // Second render would call state at indices [0, 1, 2, 3] - violates hook order
    expect(error?.message).toMatch(
      /loop|conditionally|hook order|State index/i
    );

    expect(() => {
      shouldLoop!.set(false);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('x');
  });

  it('should give conditional child components an independent hook scope', () => {
    let open: ReturnType<typeof state<boolean>> | null = null;

    const Dialog = ({ items }: { items: string[] }) => (
      <ul>
        <For each={items} by={(item) => item}>
          {(item) => <li>{item}</li>}
        </For>
      </ul>
    );

    const Widget = () => {
      open = state(false);
      return (
        <div>{open() ? <Dialog items={['first', 'second']} /> : null}</div>
      );
    };

    createIsland({ root: container, component: Widget });
    flushScheduler();

    expect(() => {
      open!.set(true);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toContain('firstsecond');
  });

  it('should explain conditional control-boundary violations without blaming component structure', () => {
    let open: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      open = state(false);
      return (
        <div>
          {open() ? (
            <For each={['first', 'second']} by={(item) => item}>
              {(item) => <span>{item}</span>}
            </For>
          ) : null}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(() => {
      open!.set(true);
      flushScheduler();
    }).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /conditional subtree.*control boundary.*<Show>.*<Case>.*<Match>/is
        ),
      })
    );

    expect(() => {
      open!.set(false);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('');
  });
  it('should throw when a render claims fewer hooks than the first render', () => {
    let flag: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      flag = state(true);
      if (flag()) {
        state(0)();
      }
      return <div>{flag() ? 'on' : 'off'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('on');

    expect(() => {
      flag!.set(false);
      flushScheduler();
    }).toThrow(/hook order violation.*1 hook.*first render.*2.*state\(\)/is);

    expect(() => {
      flag!.set(true);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('on');
  });

  it('should throw when a hook slot changes kind between renders', () => {
    let flag: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      flag = state(true);
      if (flag()) {
        state(0)();
      } else {
        derive(() => 0)();
      }
      return <div>{flag() ? 'on' : 'off'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('on');

    expect(() => {
      flag!.set(false);
      flushScheduler();
    }).toThrow(/hook order violation.*derive\(\).*index 1.*state\(\)/is);

    expect(() => {
      flag!.set(true);
      flushScheduler();
    }).not.toThrow();
    expect(container.textContent).toBe('on');
  });

  it('should throw when a conditional control boundary is skipped after the first render', () => {
    let open: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      open = state(true);
      return (
        <div>
          {open() ? (
            <For each={['first', 'second']} by={(item) => item}>
              {(item) => <span>{item}</span>}
            </For>
          ) : null}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('firstsecond');

    expect(() => {
      open!.set(false);
      flushScheduler();
    }).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(
          /<For> at index 1 was skipped.*conditional subtree.*control boundary/is
        ),
      })
    );
  });

  it('should accept the same hook sequence on every render', () => {
    let count: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      count = state(0);
      const doubled = derive(() => count!() * 2);
      const open = state(true);
      return (
        <div>
          {doubled()}
          {open() ? 'y' : 'n'}
          <For each={[count()]} by={(item) => item}>
            {(item) => <span>{item}</span>}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 1; i <= 3; i++) {
      expect(() => {
        count!.set(i);
        flushScheduler();
      }).not.toThrow();
    }
    expect(container.textContent).toBe('6y3');
  });
});
