/**
 * tests/runtime/cancellation.test.ts
 *
 * SPEC 2.6: Cancellation via AbortSignal
 *
 * Each component gets an AbortSignal that fires when the component unmounts
 * or is replaced. This allows async work to be cancelled properly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, resource } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('cancellation (SPEC 2.6)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('abort signal lifecycle', () => {
    it('should receive abort signal', async () => {
      let signalReceived = false;

      const Component = () => {
        resource(({ signal }) => {
          signalReceived = !!signal;
          return null;
        }, []);
        return { type: 'div', props: { children: ['content'] } };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      expect(signalReceived).toBe(true);
    });

    it('should fire abort signal on unmount', async () => {
      let aborted = false;

      const Component = () => {
        resource(({ signal }) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          return null;
        }, []);
        return { type: 'div', props: { children: ['content'] } };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      // Unmount by clearing container
      container.innerHTML = '';

      expect(aborted).toBe(true);
    });

    it('should fire abort signal when component is replaced', async () => {
      let oldAborted = false;
      let newAborted = false;

      const OldComponent = () => {
        resource(({ signal }) => {
          signal.addEventListener('abort', () => {
            oldAborted = true;
          });
          return null;
        }, []);
        return { type: 'div', props: { children: ['old'] } };
      };

      const NewComponent = () => {
        resource(({ signal }) => {
          signal.addEventListener('abort', () => {
            newAborted = true;
          });
          return null;
        }, []);
        return { type: 'div', props: { children: ['new'] } };
      };

      createApp({ root: container, component: OldComponent });
      flushScheduler();

      createApp({ root: container, component: NewComponent });
      flushScheduler();

      expect(oldAborted).toBe(true);
      expect(newAborted).toBe(false);
    });

    it('should respect abort signal when async work is running', async () => {
      let completed = false;

      const Component = () => {
        resource(async ({ signal }) => {
          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, 100);
              signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('cancelled'));
              });
            });
            completed = true;
          } catch {
            // cancelled
          }
          return null;
        }, []);
        return {
          type: 'div',
          props: { children: [completed ? 'done' : 'cancelled'] },
        };
      };

      createApp({ root: container, component: Component });

      // Abort before completion
      await new Promise((r) => setTimeout(r, 20));
      container.innerHTML = '';

      expect(completed).toBe(false);
    });
  });

  it('should allow user code to create AbortController and abort on unmount', async () => {
    let aborted = false;

    const Component = () => {
      resource(({ signal }) => {
        const controller = new AbortController();
        signal.addEventListener('abort', () => {
          controller.abort();
        });

        // Simulate user async work
        fetch('https://example.com', { signal: controller.signal }).catch(
          () => {
            aborted = true;
          }
        );

        return null;
      }, []);
      return { type: 'div', props: { children: ['content'] } };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    // Unmount
    cleanup();

    await new Promise((r) => setTimeout(r, 10));

    expect(aborted).toBe(true);
  });

  it('should fire abort signal when component is replaced', async () => {
    let aborted = false;

    const Component1 = () => {
      resource(({ signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        return null;
      }, []);
      return { type: 'div', children: ['component1'] };
    };

    const Component2 = () => {
      return { type: 'div', children: ['component2'] };
    };

    createApp({ root: container, component: Component1 });
    flushScheduler();

    // Replace component
    createApp({ root: container, component: Component2 });
    flushScheduler();

    expect(aborted).toBe(true);
  });

  it('should propagate abort signal to async operations without wrapping fetch', async () => {
    let aborted = false;

    const Component = () => {
      resource(({ signal }) => {
        // Direct use of AbortController, no Askr wrapper
        const controller = new AbortController();
        signal.addEventListener('abort', () => {
          controller.abort();
        });

        try {
          fetch('https://httpbin.org/delay/1', {
            signal: controller.signal,
          }).catch(() => {
            aborted = true;
          });
        } catch {
          aborted = true;
        }

        return null;
      }, []);
      return { type: 'div', children: ['fetched'] };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    // Unmount quickly
    cleanup();

    await new Promise((r) => setTimeout(r, 10));

    expect(aborted).toBe(true);
  });
});
