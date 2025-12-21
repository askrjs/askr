// tests/runtime/failure_modes.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createIsland, resource } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../helpers/test_renderer';

describe('failure modes (RUNTIME)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should catch error in render handler safely', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Component = () => ({
      type: 'button',
      props: {
        id: 'btn',
        onClick: () => {
          throw new Error('handler failed');
        },
      },
      children: ['boom'],
    });

    createIsland({ root: container, component: Component });
    flushScheduler();

    const button = container.querySelector('#btn') as HTMLButtonElement;
    button.click();
    flushScheduler(); // Ensure the handler runs

    expect(errorSpy).toHaveBeenCalledWith(
      '[Askr] Event handler error:',
      expect.any(Error)
    );
    expect((errorSpy.mock.calls[0][1] as Error).message).toContain(
      'handler failed'
    );

    const s = getSchedulerState();
    expect(s.running).toBe(false);
    expect(s.queueLength).toBe(0);
    errorSpy.mockRestore();
  });

  it('should catch error in async resource safely', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Component = () => {
      const r = resource(async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('async failed');
      }, []);

      return { type: 'div', children: [r.pending ? 'pending' : ''] };
    };

    createIsland({ root: container, component: Component });

    await new Promise((r) => setTimeout(r, 30));
    flushScheduler();

    expect(errorSpy).toHaveBeenCalled();
    const s = getSchedulerState();
    expect(s.running).toBe(false);
    errorSpy.mockRestore();
  });
});
