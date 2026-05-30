import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src/runtime/state';
import { createFineGrainedEffect } from '../../../src/runtime/effect';
import { enterBulkCommit, exitBulkCommit } from '../../../src/runtime/fastlane';
import { globalScheduler, Scheduler } from '../../../src/runtime/scheduler';
import {
  createTestContainer,
  flushScheduler,
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

  it('should preserve user microtask order around a scheduled framework flush', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];

    Promise.resolve().then(() => events.push('user-before'));
    scheduler.enqueue(() => events.push('framework'));
    Promise.resolve().then(() => events.push('user-after'));

    await Promise.resolve();

    expect(events).toEqual(['user-before', 'framework', 'user-after']);
  });
});
