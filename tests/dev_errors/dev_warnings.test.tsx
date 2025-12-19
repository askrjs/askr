// tests/dev_errors/dev_warnings.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('dev warnings (DEV_ERRORS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should warn given missing keys when rendering dynamic lists', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let items: ReturnType<typeof state<string[]>> | null = null;
    const Component = () => {
      items = state(['a', 'b', 'c']);
      return {
        type: 'div',
        children: items().map((x) => ({ type: 'div', children: [x] })),
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    // Spec: missing keys on dynamic lists should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn given unused state variable when rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Component = () => {
      state(123);
      return { type: 'div', children: ['x'] };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    // Spec: unused state should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn given slow render when in dev mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Component = () => {
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy loop
      }
      return { type: 'div', children: ['slow'] };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    // Spec: slow render should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
