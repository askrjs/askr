import { describe, expect, it, vi } from 'vite-plus/test';
import * as environment from '../../../src/common/env';
import { Scheduler } from '../../../src/runtime/scheduler';
import { ScheduledWork } from '../../../src/runtime/scheduled-work';

describe('scheduled work admission', () => {
  it('should coalesce requests while preserving ordinary task multiplicity', () => {
    const scheduler = new Scheduler();
    const run = vi.fn();
    const work = new ScheduledWork(run);
    scheduler.enqueue(run);
    scheduler.enqueue(run);
    work.request(scheduler, 'reactive');
    work.request(scheduler, 'reactive');
    expect(scheduler.getState().queueLength).toBe(3);
    scheduler.flush();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('should release silently rejected production work', () => {
    const scheduler = new Scheduler();
    const run = vi.fn();
    const work = new ScheduledWork(run);
    const development = vi
      .spyOn(environment, 'isDevelopmentEnvironment')
      .mockReturnValue(false);
    try {
      scheduler.setBulkCommitProbe(() => true);
      work.request(scheduler, 'derived');
      expect(scheduler.getState().queueLength).toBe(0);
      scheduler.setBulkCommitProbe(() => false);
      work.request(scheduler, 'derived');
      scheduler.flush();
      expect(run).toHaveBeenCalledOnce();
    } finally {
      development.mockRestore();
    }
  });

  it('should release cleared work during a flush so it can rejoin that flush', () => {
    const scheduler = new Scheduler();
    const run = vi.fn();
    const work = new ScheduledWork(run);
    scheduler.enqueueInLane('derived', () => {
      expect(scheduler.clearPendingSyncTasks()).toBe(1);
      work.request(scheduler, 'reactive');
    });
    work.request(scheduler, 'reactive');
    scheduler.flush();
    expect(run).toHaveBeenCalledOnce();
    expect(scheduler.getState()).toMatchObject({
      queueLength: 0,
      taskCount: 0,
    });
  });

  it('should preserve reentrant requests when the running work throws', () => {
    const scheduler = new Scheduler();
    const failure = new Error('flush failed');
    let runs = 0;
    const work = new ScheduledWork(() => {
      if (++runs === 1) {
        work.request(scheduler, 'reactive');
        work.request(scheduler, 'reactive');
        throw failure;
      }
    });
    work.request(scheduler, 'reactive');
    expect(() => scheduler.flush()).toThrow(failure);
    expect(runs).toBe(2);
    work.request(scheduler, 'reactive');
    scheduler.flush();
    expect(runs).toBe(3);
  });
});
