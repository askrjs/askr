import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { derive } from '../../../src/runtime/reactivity/derive';
import { selector } from '../../../src/runtime/reactivity/selector';
import { onScheduledTaskRelease } from '../../../src/runtime/scheduled-work';
import { getCurrentComponentInstance } from '../../../src/runtime';
import { task } from '../../../src/runtime';
import { createFineGrainedEffect } from '../../../src/runtime/reactivity/effect';
import {
  beginCommitTransaction,
  commitTransaction,
} from '../../../src/runtime/transactions/access';
import {
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../../../src/runtime/reactivity/readable';
import { globalScheduler, Scheduler } from '../../../src/runtime/scheduler';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scheduler invariants', () => {
  it('should replay a newly entered source changed before its branch commits', () => {
    const { container, cleanup } = createTestContainer();
    let sharedValue = 'old';
    let secondaryValue = 'secondary-old';
    let enterBranch!: () => void;
    let mountWriter!: () => void;
    let readerRenders = 0;

    const shared = (() => {
      recordReadableRead(shared);
      return sharedValue;
    }) as ReadableSource<string>;
    const writeShared = (value: string): void => {
      sharedValue = value;
      notifyReadableReaders(shared);
    };
    const secondary = (() => {
      recordReadableRead(secondary);
      return secondaryValue;
    }) as ReadableSource<string>;
    const writeSecondary = (value: string): void => {
      secondaryValue = value;
      notifyReadableReaders(secondary);
    };

    const Writer = () => {
      task(() => {
        writeShared('new');
        writeSecondary('secondary-new');
      });
      return <span>{'writer'}</span>;
    };

    const WriterHost = () => {
      const visible = state(false);
      mountWriter = () => visible.set(true);
      return <section>{visible() ? <Writer /> : null}</section>;
    };

    const Reader = () => {
      readerRenders += 1;
      const open = state(false);
      enterBranch = () => open.set(true);
      return (
        <output>{open() ? `${shared()}:${secondary()}` : 'closed'}</output>
      );
    };

    const App = () => (
      <main>
        <WriterHost />
        <Reader />
      </main>
    );

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelector('output')?.textContent).toBe('closed');
      expect(readerRenders).toBe(1);

      // The writer host is queued first. Its commit mounts Writer and runs the
      // task after Reader has rendered the old value but before Reader commits
      // its newly entered shared-source subscription.
      mountWriter();
      enterBranch();
      flushScheduler();

      expect(container.querySelector('output')?.textContent).toBe(
        'new:secondary-new'
      );
      // Both sources missed their notification, but the component receives a
      // single coalesced follow-up rather than one render per source.
      expect(readerRenders).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('should preserve unrelated queued work when a transaction starts', () => {
    let ran = false;

    globalScheduler.enqueue(() => {
      ran = true;
    });

    const transaction1 = beginCommitTransaction();
    transaction1.setDeferredNotifications(true);
    commitTransaction(transaction1);
    flushScheduler();

    expect(ran).toBe(true);
  });

  it('should keep a cleared reactive lane schedulable after transaction', () => {
    const { container, cleanup } = createTestContainer();
    let source!: State<number>;
    const committedValues: number[] = [];

    createIsland({
      root: container,
      component: () => {
        source = state(0);
        return <div>{String(source())}</div>;
      },
    });

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source(),
      commit: (value) => {
        committedValues.push(value);
      },
    });

    source.set(1);
    const transaction2 = beginCommitTransaction();
    transaction2.setDeferredNotifications(true);
    commitTransaction(transaction2);
    source.set(2);
    flushScheduler();

    expect(committedValues.at(-1)).toBe(2);

    effect.cleanup();
    cleanup();
  });

  it('should drop obsolete effect dependencies after switching branches', () => {
    const { container, cleanup } = createTestContainer();
    let useLeft!: State<boolean>;
    let left!: State<string>;
    let right!: State<string>;
    const committedValues: string[] = [];

    createIsland({
      root: container,
      component: () => {
        useLeft = state(true);
        left = state('left:0');
        right = state('right:0');
        return (
          <div>
            {useLeft() ? left() : right()}
            {right()}
          </div>
        );
      },
    });
    flushScheduler();

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => (useLeft() ? left() : right()),
      commit: (value) => {
        committedValues.push(value);
      },
    });

    expect(committedValues).toEqual(['left:0']);

    left.set('left:1');
    flushScheduler();
    expect(committedValues).toEqual(['left:0', 'left:1']);

    useLeft.set(false);
    flushScheduler();
    expect(committedValues).toEqual(['left:0', 'left:1', 'right:0']);

    left.set('left:2');
    flushScheduler();
    expect(committedValues).toEqual(['left:0', 'left:1', 'right:0']);

    right.set('right:1');
    flushScheduler();
    expect(committedValues).toEqual(['left:0', 'left:1', 'right:0', 'right:1']);

    effect.cleanup();
    cleanup();
  });

  it('should skip a disposed queued effect while sibling queued work runs', () => {
    const { container, cleanup } = createTestContainer();
    let source!: State<number>;
    const commits: string[] = [];

    createIsland({
      root: container,
      component: () => {
        source = state(0);
        return <div>{String(source())}</div>;
      },
    });
    flushScheduler();

    const first = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source(),
      commit: (value) => {
        commits.push(`first:${String(value)}`);
      },
    });
    const second = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source(),
      commit: (value) => {
        commits.push(`second:${String(value)}`);
      },
    });

    commits.length = 0;
    source.set(1);
    first.cleanup();
    flushScheduler();

    expect(commits).toEqual(['second:1']);

    second.cleanup();
    cleanup();
  });

  it('should allow more than 50 independent tasks in one flush', () => {
    const scheduler = new Scheduler();
    let runs = 0;

    for (let index = 0; index < 51; index += 1) {
      scheduler.enqueue(() => {
        runs += 1;
      });
    }

    expect(() => scheduler.flush()).not.toThrow();
    expect(runs).toBe(51);
  });

  it('should report earlier failures and drain queued work when an update loop trips the depth guard', () => {
    const scheduler = new Scheduler();
    const firstFailure = new Error('first failure');
    const order: string[] = [];
    let loopRuns = 0;

    const loop = () => {
      loopRuns += 1;
      scheduler.enqueue(loop);
    };

    scheduler.enqueue(() => {
      throw firstFailure;
    });
    scheduler.enqueue(loop);
    scheduler.enqueueInLane('post', () => order.push('post:1'));

    let thrown: unknown;
    try {
      scheduler.flush();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const errors = (thrown as AggregateError).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(firstFailure);
    expect(String(errors[1])).toMatch(/exceeded MAX_FLUSH_DEPTH \(50\)/);
    expect(loopRuns).toBe(50);
    expect(order).toEqual(['post:1']);
    expect(scheduler.getState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });

  it('should fail an update loop loudly in production instead of hanging', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const scheduler = new Scheduler();
      // Safety cap so an unguarded scheduler fails this test instead of
      // hanging the worker.
      const safetyCap = 10_000;
      let loopRuns = 0;
      const loop = () => {
        loopRuns += 1;
        if (loopRuns < safetyCap) scheduler.enqueue(loop);
      };

      scheduler.enqueue(loop);

      expect(() => scheduler.flush()).toThrow(/exceeded MAX_FLUSH_DEPTH/);
      expect(loopRuns).toBeLessThan(safetyCap);
      expect(scheduler.getState().queueLength).toBe(0);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should re-render a component after its update loop trips the depth guard', () => {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;
    let looping = false;

    createIsland({
      root: container,
      component: () => {
        count = state(0);
        const value = count();
        return (
          <div
            ref={() => {
              if (looping) count.set(value + 1);
            }}
          >
            {String(value)}
          </div>
        );
      },
    });
    flushScheduler();

    looping = true;
    count.set(1);
    expect(() => flushScheduler()).toThrow(/exceeded MAX_FLUSH_DEPTH/);

    looping = false;
    count.set(12345);
    flushScheduler();

    expect(container.textContent).toBe('12345');
    cleanup();
  });

  it('should still run sibling dirty effects when effects loop across lanes', () => {
    const { container, cleanup } = createTestContainer();
    let x!: State<number>;
    let y!: State<number>;
    let z!: State<number>;

    createIsland({
      root: container,
      component: () => {
        x = state(0);
        y = state(0);
        z = state(0);
        return <div />;
      },
    });
    flushScheduler();

    const seen: number[] = [];
    let looping = false;
    let lastZ = 0;
    const forward = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => x(),
      commit: (value) => y.set(value + 1),
    });
    const sibling = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => z(),
      commit: (value) => {
        seen.push(value);
      },
    });
    const back = createFineGrainedEffect({
      lane: 'post',
      compute: () => y(),
      commit: (value) => {
        if (!looping) return;
        lastZ = value;
        z.set(value);
        x.set(value + 1);
      },
    });
    flushScheduler();

    looping = true;
    x.set(1);
    expect(() => flushScheduler()).toThrow(
      /fine-grained effect exceeded 50 runs/
    );

    expect(lastZ).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(lastZ);
    expect(globalScheduler.getState().queueLength).toBe(0);

    forward.cleanup();
    sibling.cleanup();
    back.cleanup();
    cleanup();
  });

  it('should flush scheduler lanes in derived component reactive post order', () => {
    const scheduler = new Scheduler();
    const order: string[] = [];

    scheduler.enqueueInLane('post', () => order.push('post:1'));
    scheduler.enqueueInLane('reactive', () => order.push('reactive:1'));
    scheduler.enqueueInLane('component', () => order.push('component:1'));
    scheduler.enqueueInLane('derived', () => order.push('derived:1'));
    scheduler.enqueueInLane('component', () => order.push('component:2'));
    scheduler.enqueueInLane('derived', () => order.push('derived:2'));

    scheduler.flush();

    expect(order).toEqual([
      'derived:1',
      'derived:2',
      'component:1',
      'component:2',
      'reactive:1',
      'post:1',
    ]);
  });

  it('should drain work enqueued during an active flush without starvation', () => {
    const scheduler = new Scheduler();
    const order: string[] = [];

    scheduler.enqueue(() => {
      order.push('first');
      scheduler.enqueue(() => {
        order.push('nested');
      });
    });
    scheduler.enqueue(() => {
      order.push('sibling');
    });

    scheduler.flush();

    expect(order).toEqual(['first', 'sibling', 'nested']);
    expect(scheduler.getState()).toMatchObject({
      queueLength: 0,
      running: false,
      laneQueues: {
        component: 0,
      },
    });
  });

  it('should preserve user microtask order around a scheduled framework flush', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];

    Promise.resolve().then(() => events.push('user-before'));
    scheduler.enqueue(() => events.push('framework'));
    Promise.resolve().then(() => events.push('user-after'));

    await Promise.resolve();

    expect(events).toEqual(['user-before', 'framework', 'user-after']);
  });

  it('should keep cleanup-triggered writes coherent during an active flush', () => {
    const { container, cleanup } = createTestContainer();
    let showChild!: State<boolean>;
    let cleanupWrites!: State<number>;
    let cleanupRuns = 0;

    const Child = () => {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected child component instance');
      }

      (instance.owner.cleanups ??= []).push(() => {
        cleanupRuns += 1;
        cleanupWrites.set((value) => value + 1);
      });

      return <span id={'child'}>{'child'}</span>;
    };

    const App = () => {
      showChild = state(true);
      cleanupWrites = state(0);

      return (
        <section>
          {showChild() ? <Child /> : null}
          <output id={'writes'}>{String(cleanupWrites())}</output>
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    showChild.set(false);
    flushScheduler();

    expect(cleanupRuns).toBe(1);
    expect(container.querySelector('#child')).toBeNull();
    expect(container.querySelector('#writes')?.textContent).toBe('1');
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });

    cleanup();
  });

  it('should not resurrect disposed ownership after cleanup-triggered writes', () => {
    const { container, cleanup } = createTestContainer();
    let showChild!: State<boolean>;
    let shared!: State<number>;
    let childInstance: ReturnType<typeof getCurrentComponentInstance> = null;
    let childRenders = 0;
    let cleanupRuns = 0;

    const Child = () => {
      childRenders += 1;
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected child component instance');
      }
      childInstance = instance;
      (instance.owner.cleanups ??= []).push(() => {
        cleanupRuns += 1;
        shared.set((value) => value + 1);
      });

      return <span id={'child'}>{String(shared())}</span>;
    };

    const Sink = () => <output id={'sink'}>{String(shared())}</output>;

    const App = () => {
      showChild = state(true);
      shared = state(0);

      return (
        <section>
          {showChild() ? <Child /> : null}
          <Sink />
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(childRenders).toBe(1);
    expect(container.querySelector('#child')?.textContent).toBe('0');
    expect(container.querySelector('#sink')?.textContent).toBe('0');

    showChild.set(false);
    flushScheduler();
    flushScheduler();

    const readers = (shared as unknown as { _readers?: Map<unknown, unknown> })
      ._readers;
    expect(cleanupRuns).toBe(1);
    expect(childRenders).toBe(1);
    expect(container.querySelector('#child')).toBeNull();
    expect(container.querySelector('#sink')?.textContent).toBe('1');
    expect(readers?.has(childInstance)).toBe(false);
    expect(readers?.size ?? 0).toBe(1);

    cleanup();
  });

  it('should keep a queued duplicate pending when a bulk commit rejects its copy', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const scheduler = new Scheduler();
      let pendingUpdate = true;
      let renders = 0;
      const run = () => {
        if (!pendingUpdate) return;
        pendingUpdate = false;
        renders += 1;
      };
      onScheduledTaskRelease(run, () => {
        pendingUpdate = false;
      });

      scheduler.enqueue(run);
      let bulk = true;
      scheduler.setBulkCommitProbe(() => bulk);
      scheduler.enqueue(run);
      bulk = false;
      scheduler.flush();

      expect(renders).toBe(1);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe.each(['development', 'production'])(
  'reactive batch loop guard (%s)',
  (env) => {
    // Safety cap so an unguarded loop fails the test instead of hanging.
    const safetyCap = 5_000;

    function errorMessages(error: unknown): string {
      if (error instanceof AggregateError) {
        return error.errors.map(errorMessages).join('\n');
      }
      return String(error);
    }

    function withEnv(run: () => void): void {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = env;
      try {
        run();
      } finally {
        process.env.NODE_ENV = prev;
      }
    }

    it('should stop a selector whose source writes a state it reads', () => {
      const { container, cleanup } = createTestContainer();
      let looping = false;
      let runs = 0;
      let s!: State<number>;

      createIsland({
        root: container,
        component: () => {
          s = state(0);
          const isSelected = selector(() => {
            const value = s();
            if (looping && ++runs < safetyCap) s.set(value + 1);
            return 0;
          });
          return <div>{String(isSelected(0))}</div>;
        },
      });
      flushScheduler();

      let error: unknown;
      withEnv(() => {
        looping = true;
        s.set(1);
        try {
          flushScheduler();
        } catch (caught) {
          error = caught;
        }
        looping = false;
      });

      expect(runs).toBeLessThan(safetyCap);
      expect(errorMessages(error)).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
      cleanup();
    });

    it('should stop a derive and selector that write each other', () => {
      const { container, cleanup } = createTestContainer();
      let looping = false;
      let runs = 0;
      let a!: State<number>;

      createIsland({
        root: container,
        component: () => {
          a = state(0);
          const b = state(0);
          const d = derive(() => {
            const value = a();
            if (looping && ++runs < safetyCap) b.set(value + 1);
            return value;
          });
          const isSelected = selector(() => {
            const value = b();
            if (looping && ++runs < safetyCap) a.set(value + 1);
            return 0;
          });
          // Not read by render, so the batch (not a re-render) evaluates it.
          void d;
          return <div>{String(isSelected(0))}</div>;
        },
      });
      flushScheduler();

      let error: unknown;
      withEnv(() => {
        looping = true;
        a.set(1);
        try {
          flushScheduler();
        } catch (caught) {
          error = caught;
        }
        looping = false;
      });

      expect(runs).toBeLessThan(safetyCap);
      expect(errorMessages(error)).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
      cleanup();
    });

    it('should stop two derives that write each other', () => {
      const { container, cleanup } = createTestContainer();
      let looping = false;
      let runs = 0;
      let a!: State<number>;

      createIsland({
        root: container,
        component: () => {
          a = state(0);
          const b = state(0);
          const first = derive(() => {
            const value = a();
            if (looping && ++runs < safetyCap) b.set(value + 1);
            return value;
          });
          const second = derive(() => {
            const value = b();
            if (looping && ++runs < safetyCap) a.set(value + 1);
            return value;
          });
          // Not read by render, so the batch (not a re-render) evaluates them.
          void first;
          void second;
          return <div />;
        },
      });
      flushScheduler();

      let error: unknown;
      withEnv(() => {
        looping = true;
        a.set(1);
        try {
          flushScheduler();
        } catch (caught) {
          error = caught;
        }
        looping = false;
      });

      expect(runs).toBeLessThan(safetyCap);
      expect(errorMessages(error)).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
      cleanup();
    });
  }
);
