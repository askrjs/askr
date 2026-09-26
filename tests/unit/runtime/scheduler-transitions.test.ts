import { describe, expect, it, vi } from 'vite-plus/test';
import { Scheduler } from '../../../src/runtime/scheduler';

describe('scheduler execution transitions', () => {
  it('should expose running state without a redundant execution-depth field', () => {
    const scheduler = new Scheduler();
    const executing: boolean[] = [];
    scheduler.enqueue(() => executing.push(scheduler.isExecuting()));
    scheduler.flush();
    expect(executing).toEqual([true]);
    expect(scheduler.isExecuting()).toBe(false);
    expect(scheduler.getState()).not.toHaveProperty('executionDepth');
  });

  it('should reject work and report a failed bulk-commit probe', async () => {
    const scheduler = new Scheduler();
    const failure = new Error('probe failed');
    const reporter = vi.fn();
    const task = vi.fn();
    vi.stubGlobal('reportError', reporter);
    scheduler.setBulkCommitProbe(() => {
      throw failure;
    });
    try {
      try {
        scheduler.enqueue(task);
      } catch {
        // Development builds reject work admitted during an active commit.
      }
      expect(scheduler.getState().queueLength).toBe(0);
      await Promise.resolve();
      expect(reporter).toHaveBeenCalledWith(failure);
      expect(task).not.toHaveBeenCalled();
    } finally {
      scheduler.setBulkCommitProbe(() => false);
      scheduler.clearPendingSyncTasks();
      vi.unstubAllGlobals();
    }
  });

  it('should resume queued work after a synchronous progress callback throws', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];
    const failure = new Error('progress failed');
    const flushed = scheduler.waitForFlush();

    expect(() =>
      scheduler.runWithSyncProgress(() => {
        scheduler.enqueue(() => events.push('task'));
        throw failure;
      })
    ).toThrow(failure);

    const versionAfterFailure = scheduler.getFlushVersion();
    try {
      await Promise.resolve();
      expect(events).toEqual(['task']);
      expect(versionAfterFailure).toBe(0);
      await flushed;
      expect(scheduler.getState()).toMatchObject({
        queueLength: 0,
        taskCount: 0,
        allowSyncProgress: false,
      });
    } finally {
      scheduler.flushIfQueued();
      await flushed;
    }
  });

  it('should recheck handler scope when a previously queued kick runs', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];
    scheduler.enqueue(() => events.push('task'));
    scheduler.setInHandler(true);
    try {
      await Promise.resolve();
      expect(events).toEqual([]);
      expect(scheduler.getFlushVersion()).toBe(0);
    } finally {
      scheduler.setInHandler(false);
      await Promise.resolve();
    }
    expect(events).toEqual(['task']);
    expect(scheduler.getFlushVersion()).toBe(1);
  });

  it('should let the outermost empty progress scope complete its epoch', () => {
    const scheduler = new Scheduler();
    const versions: number[] = [];
    scheduler.runWithSyncProgress(() => {
      scheduler.runWithSyncProgress(() => {});
      versions.push(scheduler.getFlushVersion());
    });
    expect(versions).toEqual([0]);
    expect(scheduler.getFlushVersion()).toBe(1);
  });

  it('should let an active flush own progress from its nested scopes', () => {
    const scheduler = new Scheduler();
    const versions: number[] = [];
    scheduler.enqueue(() => {
      scheduler.runWithSyncProgress(() => {});
      versions.push(scheduler.getFlushVersion());
    });
    scheduler.enqueue(() => versions.push(scheduler.getFlushVersion()));
    scheduler.flush();
    expect(versions).toEqual([0, 0]);
    expect(scheduler.getFlushVersion()).toBe(1);
  });

  it('should not create a later epoch when an active flush clears pending work', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];
    scheduler.enqueue(() => {
      expect(scheduler.clearPendingSyncTasks()).toBe(1);
      scheduler.enqueue(() => events.push('replacement'));
    });
    scheduler.enqueue(() => events.push('cleared'));
    scheduler.flush();
    expect(events).toEqual(['replacement']);
    expect(scheduler.getFlushVersion()).toBe(1);
    await Promise.resolve();
    expect(scheduler.getFlushVersion()).toBe(1);
    expect(scheduler.getState().taskCount).toBe(0);
  });

  it('should retain a lexical handler scope when the compatibility flag is cleared', async () => {
    const scheduler = new Scheduler();
    const events: string[] = [];
    const scopes: boolean[] = [];
    scheduler.runInHandlerScope(() => {
      scheduler.setInHandler(false);
      scopes.push(scheduler.isInHandler());
      scheduler.runInHandlerScope(() => {
        scheduler.enqueue(() => events.push('task'));
      }, 'sync');
      events.push('outer done');
    });
    expect(scopes).toEqual([true]);
    expect(events).toEqual(['outer done']);
    await Promise.resolve();
    expect(events).toEqual(['outer done', 'task']);
  });

  it('should preserve explicit sync flushing and bulk admission through nested scopes', () => {
    const scheduler = new Scheduler();
    const events: string[] = [];
    let bulk = true;
    scheduler.setBulkCommitProbe(() => bulk);
    scheduler.runWithSyncProgress(() => {
      scheduler.runWithSyncProgress(() => {
        scheduler.enqueueInLane('post', () => events.push('post'));
        scheduler.enqueueInLane('derived', () => events.push('derived'));
      });
      expect(events).toEqual(['derived', 'post']);
      expect(scheduler.getState().allowSyncProgress).toBe(true);
    });
    expect(scheduler.getState().allowSyncProgress).toBe(false);
    bulk = false;
    scheduler.runInHandlerScope(() => {
      scheduler.enqueue(() => events.push('handler'));
    }, 'sync');
    expect(events).toEqual(['derived', 'post', 'handler']);
  });

  it('should restore enclosing permissions after nested callbacks fail', () => {
    const scheduler = new Scheduler();
    const failure = new Error('nested failure');
    const events: string[] = [];
    scheduler.runWithSyncProgress(() => {
      expect(() =>
        scheduler.runWithSyncProgress(() => {
          scheduler.enqueue(() => events.push('nested'));
          throw failure;
        })
      ).toThrow(failure);
      expect(scheduler.getState().allowSyncProgress).toBe(true);
      expect(scheduler.getFlushVersion()).toBe(0);
      scheduler.enqueue(() => events.push('outer'));
    });
    expect(events).toEqual(['nested', 'outer']);
    expect(scheduler.getFlushVersion()).toBe(1);
    expect(scheduler.getState().allowSyncProgress).toBe(false);
  });
});
