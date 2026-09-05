import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { task } from './lifecycle.js';

/**
 * Serialized update scheduler — safer design (no inline execution, explicit flush)
 *
 * Key ideas:
 * - Never execute a task inline from `enqueue`.
 * - `flush()` is explicit and non-reentrant.
 * - `runWithSyncProgress()` allows enqueues temporarily but does not run tasks
 *   inline; it runs `fn` and then does an explicit `flush()`.
 * - `waitForFlush()` is race-free with a monotonic `flushVersion`.
 */
type Task = () => void;

type SchedulerLane = 'derived' | 'component' | 'reactive' | 'post';

type SchedulerBulkCommitProbe = () => boolean;

declare class Scheduler {
  private bulkCommitProbe;
  private lanes;
  private running;
  private inHandler;
  private depth;
  private executionDepth;
  private flushVersion;
  private kickScheduled;
  private allowSyncProgress;
  private waiters;
  private taskCount;
  setBulkCommitProbe(probe: SchedulerBulkCommitProbe): void;
  private isBulkCommitActive;
  private hasPendingTasks;
  private getPendingTaskCount;
  private compactLane;
  private scheduleFlushKick;
  enqueue(task: Task): void;
  enqueueInLane(lane: SchedulerLane, task: Task): void;
  flush(): void;
  runWithSyncProgress<T>(fn: () => T): T;
  waitForFlush(targetVersion?: number, timeoutMs?: number): Promise<void>;
  getState(): {
    queueLength: number;
    running: boolean;
    depth: number;
    executionDepth: number;
    taskCount: number;
    flushVersion: number;
    laneQueues: {
      derived: number;
      component: number;
      reactive: number;
      post: number;
    };
    inHandler: boolean;
    allowSyncProgress: boolean;
  };
  getFlushVersion(): number;
  flushIfQueued(): void;
  runInHandlerScope<T>(fn: () => T, flushMode?: 'defer' | 'sync'): T;
  setInHandler(v: boolean): void;
  isInHandler(): boolean;
  isExecuting(): boolean;
  clearPendingSyncTasks(): number;
  private resolveWaiters;
}

declare function scheduleEventHandler(handler: EventListener): EventListener;
export {
  Task,
  SchedulerLane,
  SchedulerBulkCommitProbe,
  Scheduler,
  scheduleEventHandler,
};
