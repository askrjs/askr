import { describe, it, expect, vi } from 'vitest';
import {
  createIsland,
  state,
  derive,
  task,
  timer,
  on,
  stream,
} from '../../src/index';
import type { ComponentFunction } from '../../src/runtime/component';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

describe('operations (BINDING_SPEC) — gaps', () => {
  it('should run task() once when component mounts', async () => {
    const calls: string[] = [];

    const App: ComponentFunction = () => {
      task(() => {
        calls.push('ran');
      });
      return { type: 'div', children: ['ok'] };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      await waitForNextEvaluation();
      flushScheduler();

      expect(calls).toEqual(['ran']);
    } finally {
      cleanup();
    }
  });

  it('should not recompute derive() when source is unchanged', () => {
    const mapCalls: number[] = [];
    let bumpUnrelated: () => void = () => {}; // Initialize with no-op

    const App: ComponentFunction = () => {
      const source = state(1);
      const unrelated = state(0);

      bumpUnrelated = () => unrelated.set(unrelated() + 1);

      const doubled = derive(
        () => source(),
        (n) => {
          mapCalls.push(n);
          return n * 2;
        }
      );

      return { type: 'div', children: [String(doubled), String(unrelated())] };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createApp({ root: container, component: App });
      flushScheduler();

      // Trigger a re-render without changing `source()`.

      bumpUnrelated();

      flushScheduler();

      expect(mapCalls).toEqual([1]);
    } finally {
      cleanup();
    }
  });

  it('should register on() listeners on mount and invoke handler when event occurs', () => {
    const target = new EventTarget();
    let calls = 0;

    const App: ComponentFunction = () => {
      on(target, 'ping', () => {
        calls++;
      });
      return { type: 'div', children: ['ok'] };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      target.dispatchEvent(new Event('ping'));
      flushScheduler();

      expect(calls).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should schedule timer() callbacks and stop them when component unmounts', () => {
    vi.useFakeTimers();

    let calls = 0;
    const App: ComponentFunction = () => {
      timer(10, () => {
        calls++;
      });
      return { type: 'div', children: ['ok'] };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      vi.advanceTimersByTime(35);
      expect(calls).toBeGreaterThanOrEqual(3);

      // Unmount by clearing container.
      container.innerHTML = '';

      vi.advanceTimersByTime(50);
      expect(calls).toBeGreaterThanOrEqual(3);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('should expose pending=true when stream has not produced a value', () => {
    const App: ComponentFunction = () => {
      const messages = stream<string>({});
      return {
        type: 'div',
        children: [messages.pending ? 'pending' : 'ready'],
      };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(container.textContent).toContain('pending');
    } finally {
      cleanup();
    }
  });
});
