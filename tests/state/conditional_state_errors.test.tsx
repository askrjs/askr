// tests/state/conditional_state_errors.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('conditional state errors (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should throw error when state() is called in if block', async () => {
    let show: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      show = state(false);
      if (show()) {
        state('illegal');
      }
      const ok = state('ok');
      return { type: 'div', children: [ok()] };
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

  it('should throw error when state() is called after return', () => {
    const Component = () => {
      return { type: 'div', children: ['early'] };
      // Unreachable state call - should be detected as invalid structure.
      state('nope');
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).toThrow();
  });

  it('should not throw error when state() is called in try/catch', () => {
    const Component = () => {
      try {
        state('x');
      } catch {
        // ignored
      }
      return { type: 'div', children: ['x'] };
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).not.toThrow();
  });
});
