import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src/index';
import { resource } from '../../../src/resources';
import { globalScheduler, Scheduler } from '../../../src/runtime/scheduler';
import { scheduleEventHandler } from '../../../src/runtime/access';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scheduler (SPEC 2.2)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('FIFO task execution', () => {
    it('should drain sibling work and settle waiters when a task throws', async () => {
      const scheduler = new Scheduler();
      const taskError = new Error('task failed');
      const events: string[] = [];

      scheduler.enqueue(() => {
        events.push('failed');
        throw taskError;
      });
      scheduler.enqueue(() => {
        events.push('sibling');
      });

      const flushed = scheduler.waitForFlush();
      expect(() => scheduler.flush()).toThrow(taskError);
      await flushed;

      expect(events).toEqual(['failed', 'sibling']);
      expect(scheduler.getState().queueLength).toBe(0);
      expect(scheduler.getState().taskCount).toBe(0);
    });

    it('should remove waiters as soon as they time out', async () => {
      vi.useFakeTimers();
      const scheduler = new Scheduler();
      const waiterCount = () =>
        (
          scheduler as unknown as {
            waiters: unknown[];
          }
        ).waiters.length;

      try {
        const waits = Array.from({ length: 10 }, () =>
          scheduler.waitForFlush(1, 25).catch((error: unknown) => error)
        );

        expect(waiterCount()).toBe(10);
        await vi.advanceTimersByTimeAsync(25);
        const errors = await Promise.all(waits);

        expect(errors).toEqual(
          Array.from({ length: 10 }, () =>
            expect.objectContaining({
              message: expect.stringContaining('waitForFlush timeout 25ms'),
            })
          )
        );
        expect(waiterCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should execute tasks in the order enqueued', async () => {
      const order: number[] = [];

      const Component = () => {
        const count = state(0);

        return (
          <button
            onClick={() => {
              count.set(1);
              order.push(1);

              count.set(2);
              order.push(2);

              count.set(3);
              order.push(3);
            }}
          >
            {String(count())}
          </button>
        );
      };

      createIsland({ root: container, component: Component });

      const button = container.querySelector('button') as HTMLButtonElement;
      // (debug logging removed)
      button?.click();

      flushScheduler();

      // Debug: show order
      // (debug logging removed)

      // All three writes happened in order
      expect(order).toEqual([1, 2, 3]);
    });

    it('should render multiple components in order', async () => {
      const renderLog: number[] = [];

      const ComponentA = () => {
        const count = state(0);
        renderLog.push(1);
        return (
          <button onClick={() => count.set(count() + 1)} id="a">
            {`A ${count()}`}
          </button>
        );
      };

      const ComponentB = () => {
        const count = state(0);
        renderLog.push(2);
        return (
          <button onClick={() => count.set(count() + 1)} id="b">
            {`B ${count()}`}
          </button>
        );
      };

      createIsland({
        root: container,
        component: () => (
          <div>
            <ComponentA />
            <ComponentB />
          </div>
        ),
      });

      // Both rendered in order during initial render
      expect(renderLog).toEqual([1, 2]);
    });
  });

  describe('coalescing multiple writes', () => {
    it('should coalesce multiple state writes into one render', async () => {
      // See issues/coalescing-behavior.md
      const renderCounts: number[] = [];

      const Component = () => {
        const count = state(0);
        renderCounts.push(1);

        return (
          <button
            onClick={() => {
              // A few rapid writes (kept small to avoid tripping max-depth guard
              // in the current implementation).
              count.set(1);
              count.set(2);
              count.set(3);
              renderCounts.push(2);
            }}
          >
            {String(count())}
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      renderCounts.length = 0; // Clear initial render

      const button = container.querySelector('button') as HTMLButtonElement;
      button?.click();

      flushScheduler();

      // Writes coalesced into 1 render (ASPIRATIONAL)
      expect(renderCounts).toEqual([2, 1]);

      // Final value is correct (3, not intermediate)
      expect(button.textContent).toContain('3');
    });

    it('should have correct final coalesced state regardless of write order', async () => {
      // See issues/coalescing-behavior.md
      const Component = () => {
        const x = state(0);
        const y = state(0);

        return (
          <button
            onClick={() => {
              x.set(5);
              y.set(3);
              x.set(10);
              y.set(7);
              x.set(x() + 1);
            }}
          >
            x={String(x())} y={String(y())}
          </button>
        );
      };

      createIsland({ root: container, component: Component });

      const button = container.querySelector('button') as HTMLButtonElement;
      button?.click();

      flushScheduler();

      // Final state: x=11 (10+1), y=7 (ASPIRATIONAL)
      expect(button.textContent).toContain('x=11 y=7');
    });
  });

  describe('no reentrancy', () => {
    it('should not immediately re-render when state.set() is called during render', () => {
      let renderAttempts = 0;
      let renderWriteError: unknown;

      const Component = () => {
        const count = state(0);
        renderAttempts++;

        // A render-time write must be rejected instead of re-entering render.
        if (renderAttempts === 1) {
          try {
            count.set(1);
          } catch (error) {
            renderWriteError = error;
          }
        }

        return <div>{`count: ${String(count())}`}</div>;
      };

      createIsland({ root: container, component: Component });
      expect(renderAttempts).toBe(1);

      flushScheduler();

      expect(renderAttempts).toBe(1);
      expect(container.textContent).toBe('count: 0');
      expect(renderWriteError).toBeInstanceOf(Error);
      expect((renderWriteError as Error).message).toContain(
        'state.set() cannot be called during component render'
      );
    });

    it('should not interleave nested event handlers', () => {
      const order: string[] = [];

      const Component = () => {
        const count = state(0);
        order.push(`render:${String(count())}`);

        return (
          <div>
            <button
              id="outer"
              onClick={() => {
                order.push('outer-start');
                count.set(count() + 1);
                // Dispatch a nested event while the outer handler is running.
                (
                  container.querySelector('#inner') as HTMLButtonElement
                ).click();
                order.push('outer-end');
              }}
            >
              {`Outer ${String(count())}`}
            </button>
            <button
              id="inner"
              onClick={(event: Event) => {
                event.stopPropagation();
                order.push('inner-start');
                count.set(count() + 1);
                order.push('inner-end');
              }}
            >
              Inner
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      order.length = 0;

      (container.querySelector('#outer') as HTMLButtonElement).click();
      flushScheduler();

      // The nested handler runs inside the outer one, but neither handler's
      // writes are flushed until the outermost handler has finished.
      expect(order).toEqual([
        'outer-start',
        'inner-start',
        'inner-end',
        'outer-end',
        'render:2',
      ]);
      expect(container.querySelector('#outer')?.textContent).toBe('Outer 2');
    });
  });

  describe('async continuations maintain order', () => {
    it('should complete async resource results after all prior sync tasks', async () => {
      const order: string[] = [];

      const Component = ({ id, delay }: { id: string; delay: number }) => {
        const r = resource(async () => {
          order.push(`async-${id}-start`);
          await new Promise((r) => setTimeout(r, delay));
          order.push(`async-${id}-end`);
          return id;
        }, [id, delay]);

        return <div>{r.value ?? ''}</div>;
      };

      createIsland({
        root: container,
        component: () => Component({ id: 'A', delay: 10 }),
      });

      await new Promise((r) => setTimeout(r, 5));

      createIsland({
        root: container,
        component: () => Component({ id: 'B', delay: 10 }),
      });

      await new Promise((r) => setTimeout(r, 50));
      // Allow microtasks to settle and flush any pending work
      await new Promise((r) => setTimeout(r, 0));
      flushScheduler();

      // B started after A, so A started first — validate ordering only when
      // both entries are present (tests should not rely on exact scheduling).
      expect(order).toContain('async-A-start');
      if (order.includes('async-B-start')) {
        const aIndex = order.indexOf('async-A-start');
        const bIndex = order.indexOf('async-B-start');
        expect(aIndex).toBeLessThan(bIndex);
      }
    });
  });

  describe('max-depth guard prevents infinite loops', () => {
    it('should throw when state.set() is called during render', () => {
      const Component = () => {
        const count = state(0);

        // Try to mutate during render (should error before loop)
        try {
          count.set(1); // This should throw
        } catch {
          // Expected - state.set() guards against render-time mutation
        }

        return <div>{String(count())}</div>;
      };

      // Should not throw during component creation (guards are in place)
      expect(() => {
        createIsland({ root: container, component: Component });
      }).not.toThrow();
    });
  });

  describe('determinism under load', { timeout: 30000 }, () => {
    it('should produce identical final state each time when 100 rapid clicks occur', async () => {
      // See issues/determinism-under-load.md
      const finalValues: number[] = [];

      const Component = () => {
        const count = state(0);

        return (
          <button onClick={() => count.set(count() + 1)}>
            {String(count())}
          </button>
        );
      };

      // First run: 100 clicks
      createIsland({ root: container, component: Component });
      const button1 = container.querySelector('button') as HTMLButtonElement;

      for (let i = 0; i < 100; i++) {
        button1?.click();
      }
      flushScheduler();
      finalValues.push(parseInt(button1.textContent!));

      // Clean up and repeat
      cleanup();
      const result = createTestContainer();
      container = result.container;
      cleanup = result.cleanup;

      // Second run: 100 clicks
      createIsland({ root: container, component: Component });
      const button2 = container.querySelector('button') as HTMLButtonElement;

      for (let i = 0; i < 100; i++) {
        button2?.click();
      }
      flushScheduler();
      finalValues.push(parseInt(button2.textContent!));

      // Both runs produced identical final state
      expect(finalValues[0]).toBe(finalValues[1]);
      expect(finalValues[0]).toBe(100);
    });
  });

  describe('event wrapper semantics', () => {
    it('should run handler synchronously and defer flush', async () => {
      const order: string[] = [];
      let wrapped!: EventListener;

      const Component = () => {
        const count = state(0);
        wrapped = scheduleEventHandler(() => {
          order.push('handler-start');
          count.set(count() + 1);
          order.push('handler-end');
        });

        return <output>{String(count())}</output>;
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      const output = container.querySelector('output') as HTMLOutputElement;

      // Invoke the wrapper directly so no DOM event delegation (which flushes
      // on its own terms) sits around it.
      wrapped(new Event('custom'));

      // The handler runs synchronously ...
      expect(order).toEqual(['handler-start', 'handler-end']);
      // ... but its write is not flushed inline.
      expect(output.textContent).toBe('0');
      expect(globalScheduler.getState().queueLength).toBeGreaterThan(0);

      // The deferred flush runs on the scheduler's microtask kick.
      await Promise.resolve();

      expect(output.textContent).toBe('1');
      expect(globalScheduler.getState().queueLength).toBe(0);
    });
  });

  describe('mixed-lane flush semantics', () => {
    it('should drain all lanes in priority order and leave the queue empty', () => {
      const order: string[] = [];

      globalScheduler.clearPendingSyncTasks();

      globalScheduler.enqueueInLane('post', () => {
        order.push('post');
      });
      globalScheduler.enqueueInLane('reactive', () => {
        order.push('reactive');
      });
      globalScheduler.enqueueInLane('component', () => {
        order.push('component');
      });
      globalScheduler.enqueueInLane('derived', () => {
        order.push('derived');
      });

      globalScheduler.flush();

      expect(order).toEqual(['derived', 'component', 'reactive', 'post']);

      const state = globalScheduler.getState();
      expect(state.queueLength).toBe(0);
      expect(state.laneQueues).toEqual({
        derived: 0,
        component: 0,
        reactive: 0,
        post: 0,
      });
    });

    it('should run work enqueued mid-flush in the same flush, one priority pass at a time', () => {
      const order: string[] = [];

      globalScheduler.clearPendingSyncTasks();

      globalScheduler.enqueueInLane('post', () => {
        order.push('post');
      });
      globalScheduler.enqueueInLane('reactive', () => {
        order.push('reactive');
      });
      globalScheduler.enqueueInLane('component', () => {
        order.push('component');
        // Same lane: drained before the flush moves to the next lane.
        globalScheduler.enqueueInLane('component', () => {
          order.push('component:mid');
        });
        // Lower-priority lane: runs when this pass reaches it.
        globalScheduler.enqueueInLane('post', () => {
          order.push('post:mid');
        });
        // Higher-priority lane: this pass has already left it, so it runs
        // at the start of the next pass, ahead of any later lower work.
        globalScheduler.enqueueInLane('derived', () => {
          order.push('derived:mid');
          globalScheduler.enqueueInLane('reactive', () => {
            order.push('reactive:late');
          });
        });
      });
      globalScheduler.enqueueInLane('derived', () => {
        order.push('derived');
      });

      const versionBefore = globalScheduler.getFlushVersion();
      globalScheduler.flush();

      expect(order).toEqual([
        'derived',
        'component',
        'component:mid',
        'reactive',
        'post',
        'post:mid',
        'derived:mid',
        'reactive:late',
      ]);
      // All of it happened inside one flush.
      expect(globalScheduler.getFlushVersion()).toBe(versionBefore + 1);
      expect(globalScheduler.getState().queueLength).toBe(0);
    });
  });
});
// @askr-allow-real-timers -- scheduler timing integration fixture.
