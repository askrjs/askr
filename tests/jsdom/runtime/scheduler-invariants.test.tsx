import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src/runtime/state';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { createFineGrainedEffect } from '../../../src/runtime/effect';
import { enterBulkCommit, exitBulkCommit } from '../../../src/runtime/fastlane';
import { globalScheduler, Scheduler } from '../../../src/runtime/scheduler';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scheduler invariants', () => {
  it('should preserve unrelated queued work when a bulk commit starts', () => {
    let ran = false;

    globalScheduler.enqueue(() => {
      ran = true;
    });

    enterBulkCommit();
    exitBulkCommit();
    flushScheduler();

    expect(ran).toBe(true);
  });

  it('should keep a cleared reactive lane schedulable after bulk commit', () => {
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
    enterBulkCommit();
    exitBulkCommit();
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

      instance.cleanupFns.push(() => {
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
      executionDepth: 0,
      taskCount: 0,
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
      instance.cleanupFns.push(() => {
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
});
