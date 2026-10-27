import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Computation, Signal } from '../../../src/core/reactive/graph';
import {
  MAX_RUNS_PER_FLUSH,
  MAX_FOLLOW_UP_JOBS_PER_FLUSH,
  batch,
  queueTask,
  clearScheduler,
  effectScheduler,
  flushSync,
  getSchedulerState,
  schedule,
  type Job,
  type Lane,
} from '../../../src/core/reactive/scheduler';

function job(run: () => void): Job {
  return { run };
}

function enqueue(run: () => void, lane: Lane = 'render'): Job {
  const scheduled = job(run);
  schedule(scheduled, lane);
  return scheduled;
}

describe('core scheduler', () => {
  afterEach(() => {
    clearScheduler();
  });

  it('should allow more than the per-job run limit of independent jobs in one flush', () => {
    let runs = 0;
    for (let index = 0; index <= MAX_RUNS_PER_FLUSH; index += 1) {
      enqueue(() => {
        runs += 1;
      });
    }

    expect(() => flushSync()).not.toThrow();
    expect(runs).toBe(MAX_RUNS_PER_FLUSH + 1);
  });

  it('should report earlier failures and drain queued work when a job loops past the guard', () => {
    const firstFailure = new Error('first failure');
    const order: string[] = [];
    let loopRuns = 0;
    const loop: Job = {
      run: () => {
        loopRuns += 1;
        schedule(loop, 'render');
      },
    };

    enqueue(() => {
      throw firstFailure;
    });
    schedule(loop, 'render');
    enqueue(() => order.push('post:1'), 'post');

    let thrown: unknown;
    try {
      flushSync();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const errors = (thrown as AggregateError).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(firstFailure);
    expect(String(errors[1])).toMatch(
      new RegExp(`exceeded MAX_FLUSH_DEPTH \\(${MAX_RUNS_PER_FLUSH}\\)`)
    );
    expect(loopRuns).toBe(MAX_RUNS_PER_FLUSH);
    expect(order).toEqual(['post:1']);
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });

  it('should fail a looping job loudly in production instead of hanging', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // Safety cap so an unguarded scheduler fails this test instead of
      // hanging the worker.
      const safetyCap = 10_000;
      let loopRuns = 0;
      const loop: Job = {
        run: () => {
          loopRuns += 1;
          if (loopRuns < safetyCap) schedule(loop, 'render');
        },
      };
      schedule(loop, 'render');

      expect(() => flushSync()).toThrow(/exceeded MAX_FLUSH_DEPTH/);
      expect(loopRuns).toBeLessThan(safetyCap);
      expect(getSchedulerState().queueLength).toBe(0);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should flush lanes in render, effect, post order and shallow renders first', () => {
    const order: string[] = [];
    enqueue(() => order.push('post'), 'post');
    enqueue(() => order.push('effect'), 'effect');
    schedule({ depth: 2, run: () => order.push('render:deep') }, 'render');
    schedule({ depth: 0, run: () => order.push('render:root') }, 'render');

    flushSync();

    expect(order).toEqual(['render:root', 'render:deep', 'effect', 'post']);
  });

  it('should drain work scheduled during an active flush after queued siblings', () => {
    const order: string[] = [];
    enqueue(() => {
      order.push('first');
      enqueue(() => order.push('nested'));
    });
    enqueue(() => order.push('sibling'));

    flushSync();

    expect(order).toEqual(['first', 'sibling', 'nested']);
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });

  it('should preserve callback and flush failures from the same batch', () => {
    const callbackError = new Error('batch callback failed');
    const flushError = new Error('scheduled job failed');
    const flushed: string[] = [];

    let thrown: unknown;
    try {
      batch(() => {
        schedule({ run: () => flushed.push('completed') }, 'effect');
        schedule(
          {
            run: () => {
              throw flushError;
            },
          },
          'post'
        );
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      callbackError,
      flushError,
    ]);
    expect(flushed).toEqual(['completed']);
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });

  it('should preserve a lone batch callback error unchanged', () => {
    const callbackError = new Error('batch callback failed');

    let thrown: unknown;
    try {
      batch(() => {
        throw callbackError;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(callbackError);
  });

  it('should preserve a lone batch flush error unchanged', () => {
    const flushError = new Error('scheduled job failed');

    expect(() =>
      batch(() => {
        schedule(
          {
            run: () => {
              throw flushError;
            },
          },
          'post'
        );
      })
    ).toThrow(flushError);
  });

  it('should preserve user microtask order around a scheduled flush', async () => {
    const events: string[] = [];

    Promise.resolve().then(() => events.push('user-before'));
    enqueue(() => events.push('framework'));
    Promise.resolve().then(() => events.push('user-after'));

    await Promise.resolve();

    expect(events).toEqual(['user-before', 'framework', 'user-after']);
  });

  it('should skip a job that becomes inert before its turn', () => {
    let disposed = false;
    const order: string[] = [];
    enqueue(() => {
      order.push('first');
      disposed = true;
    });
    schedule(
      {
        run: () => order.push('skipped'),
        get skip() {
          return disposed;
        },
      },
      'render'
    );
    enqueue(() => order.push('sibling'));

    flushSync();

    expect(order).toEqual(['first', 'sibling']);
  });

  it('should schedule a computation again after the guard or a clear drops it', () => {
    const x = new Signal(0);
    const y = new Signal(0);
    let looping = false;
    const seen: number[] = [];
    const forward = new Computation(
      null,
      () => {
        const value = x.read();
        seen.push(value);
        if (looping) y.write(value + 1);
      },
      effectScheduler('effect'),
      null
    );
    const back = new Computation(
      null,
      () => {
        const value = y.read();
        if (looping) x.write(value + 1);
      },
      effectScheduler('effect'),
      null
    );
    forward.run();
    back.run();

    looping = true;
    x.write(100);
    expect(() => flushSync()).toThrow(/exceeded MAX_FLUSH_DEPTH/);

    looping = false;
    x.write(500);
    flushSync();
    expect(seen.at(-1)).toBe(500);

    x.write(600);
    clearScheduler();
    x.write(700);
    flushSync();
    expect(seen.at(-1)).toBe(700);
    forward.dispose();
    back.dispose();
  });

  it('should drop work queued by cancellation callbacks while clearing', () => {
    let ran = false;
    schedule(
      {
        run: () => {
          throw new Error('cleared job ran');
        },
        cancel: () => queueTask(() => (ran = true)),
      },
      'post'
    );

    clearScheduler();

    expect(getSchedulerState().queueLength).toBe(0);
    expect(() => flushSync()).not.toThrow();
    expect(ran).toBe(false);
  });

  it('should clear queued siblings during a flush and keep later work', () => {
    const order: string[] = [];
    enqueue(() => {
      order.push('running');
      clearScheduler();
      schedule({ run: () => order.push('after-clear') }, 'post');
    });
    enqueue(() => order.push('cleared-sibling'));

    flushSync();

    expect(order).toEqual(['running', 'after-clear']);
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
  });

  it('should cancel every queued job even when a cancellation callback throws', () => {
    const failure = new Error('cancel failed');
    let laterCancelled = false;
    schedule(
      {
        run: () => undefined,
        cancel: () => {
          throw failure;
        },
      },
      'post'
    );
    schedule(
      {
        run: () => undefined,
        cancel: () => {
          laterCancelled = true;
        },
      },
      'post'
    );

    expect(() => clearScheduler()).toThrow(failure);
    expect(laterCancelled).toBe(true);
    expect(getSchedulerState().queueLength).toBe(0);
  });

  it('should run equal-depth render jobs in queue order, including jobs queued mid-flush', () => {
    const order: string[] = [];
    const renderAt = (name: string, depth: number, then?: () => void): Job => {
      const scheduled: Job = {
        depth,
        run: () => {
          order.push(name);
          then?.();
        },
      };
      schedule(scheduled, 'render');
      return scheduled;
    };

    renderAt('b1', 2);
    renderAt('a1', 1, () => {
      renderAt('a3', 1);
      renderAt('c1', 3);
      renderAt('root', 0);
    });
    renderAt('b2', 2);
    renderAt('a2', 1);
    flushSync();

    expect(order).toEqual(['a1', 'root', 'a2', 'a3', 'b1', 'b2', 'c1']);
  });

  it('should drain large effect and post lanes in queue order', () => {
    const seen: number[] = [];
    for (let index = 0; index < 5000; index++) {
      enqueue(() => seen.push(index), index % 2 === 0 ? 'effect' : 'post');
    }
    flushSync();
    const effects = seen.slice(0, 2500);
    const posts = seen.slice(2500);
    expect(effects).toEqual(effects.slice().sort((a, b) => a - b));
    expect(effects.every((value) => value % 2 === 0)).toBe(true);
    expect(posts).toEqual(posts.slice().sort((a, b) => a - b));
    expect(posts.every((value) => value % 2 === 1)).toBe(true);
    expect(getSchedulerState().laneQueues).toEqual({
      render: 0,
      effect: 0,
      post: 0,
    });
  });

  it('should stop a queueTask that queues a fresh closure on every run', () => {
    let runs = 0;
    const loop = (): void => {
      runs += 1;
      queueTask(() => loop());
    };
    queueTask(loop);

    expect(() => flushSync()).toThrow(/exceeded \d+ follow-up jobs/);
    expect(runs).toBeGreaterThan(MAX_RUNS_PER_FLUSH);
    expect(runs).toBeLessThanOrEqual(MAX_FOLLOW_UP_JOBS_PER_FLUSH + 2);
    expect(getSchedulerState().queueLength).toBe(0);
    // The scheduler is usable again after the stopped flush.
    let after = 0;
    queueTask(() => {
      after += 1;
    });
    expect(() => flushSync()).not.toThrow();
    expect(after).toBe(1);
  });

  it('should not cap a large number of initially queued jobs or a moderate chain', () => {
    let runs = 0;
    for (let index = 0; index < 20_000; index += 1) {
      queueTask(() => {
        runs += 1;
      });
    }
    let chain = 0;
    const next = (): void => {
      chain += 1;
      if (chain < 5_000) queueTask(next);
    };
    queueTask(next);
    expect(() => flushSync()).not.toThrow();
    expect(runs).toBe(20_000);
    expect(chain).toBe(5_000);
  });

  it('should run render jobs shallowest first and in queue order within a depth', () => {
    const order: number[] = [];
    const expected: Array<{ id: number; depth: number }> = [];
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    batch(() => {
      for (let id = 0; id < 400; id += 1) {
        const depth = random() % 9;
        expected.push({ id, depth });
        schedule({ depth, run: () => void order.push(id) }, 'render');
      }
      expected.sort((a, b) => a.depth - b.depth || a.id - b.id);
      expect(order).toEqual([]);
    });
    expect(order).toEqual(expected.map((entry) => entry.id));
  });

  it('should count repeated runs of a job on every flush from zero', () => {
    let runs = 0;
    const repeating: Job = {
      run() {
        runs += 1;
        if (runs % 40 !== 0) schedule(repeating, 'post');
      },
    };
    // 40 runs per flush stays below the limit, flush after flush.
    for (let round = 0; round < 5; round += 1) {
      schedule(repeating, 'post');
      expect(() => flushSync()).not.toThrow();
    }
    expect(runs).toBe(200);
  });
});
