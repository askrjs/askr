// tests/state/conditional_state_errors.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('conditional state errors (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should throw error when state() is called in if block', async () => {
    let show: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      show = state(false);
      if (show()) {
        state('illegal');
      }
      const ok = state('ok');
      return <div>{ok()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toContain('ok');

    // Hook order violation should throw
    expect(() => {
      show!.set(true);
      flushScheduler();
    }).toThrow(/hook order|conditionally/i);
  });

  it('should not throw when unreachable state() calls exist after return (static heuristics removed)', () => {
    const Component = () => {
      return <div>early</div>;
      // Unreachable state call - unreachable and not executed at runtime.
      state('nope');
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).not.toThrow();
  });

  it('should not throw error when state() is called in try/catch', () => {
    const Component = () => {
      try {
        state('x');
      } catch {
        // ignored
      }
      return <div>x</div>;
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).not.toThrow();
  });
});
