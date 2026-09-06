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

import { isDevelopmentEnvironment } from '../common/env';
import { assertSchedulingPrecondition, invariant } from '../common/invariant';
import { logger } from '../common/logger';
import { recordSchedulerFlushTaskCount } from './diagnostics/perf-metrics';
import { adjustOwnershipDiagnostic } from './diagnostics/ownership-diagnostics';
import { SchedulerScopes } from './scheduler-scopes';
import { ScheduledWork } from './scheduled-work';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const MAX_FLUSH_DEPTH = 50;

type Task = () => void;
export type SchedulerLane = 'derived' | 'component' | 'reactive' | 'post';
export type SchedulerBulkCommitProbe = () => boolean;

export const SCHEDULER_LANES: readonly SchedulerLane[] = [
  'derived',
  'component',
  'reactive',
  'post',
];

interface LaneQueue {
  tasks: Task[];
  head: number;
}

interface FlushWaiter {
  target: number;
  resolve: () => void;
  reject: (err: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class Scheduler {
  private bulkCommitProbe: SchedulerBulkCommitProbe = () => false;

  private lanes: Record<SchedulerLane, LaneQueue> = {
    derived: { tasks: [], head: 0 },
    component: { tasks: [], head: 0 },
    reactive: { tasks: [], head: 0 },
    post: { tasks: [], head: 0 },
  };

  private readonly scopes = new SchedulerScopes();
  private running = false;
  private depth = 0;
  private executionDepth = 0; // for compat with existing diagnostics

  // Monotonic flush version increments at end of each flush
  private flushVersion = 0;

  // Best-effort microtask kick scheduling
  private kickScheduled = false;

  // Waiters waiting for flushVersion >= target
  private waiters: FlushWaiter[] = [];

  // Keep a lightweight taskCount for compatibility/diagnostics
  private taskCount = 0;

  setBulkCommitProbe(probe: SchedulerBulkCommitProbe): void {
    this.bulkCommitProbe = probe;
  }

  private isBulkCommitActive(): boolean {
    try {
      return this.bulkCommitProbe();
    } catch (e) {
      void e;
      return false;
    }
  }

  private hasPendingTasks(): boolean {
    for (const lane of SCHEDULER_LANES) {
      const queue = this.lanes[lane];
      if (queue.head < queue.tasks.length) {
        return true;
      }
    }
    return false;
  }

  private getPendingTaskCount(): number {
    let total = 0;
    for (const lane of SCHEDULER_LANES) {
      const queue = this.lanes[lane];
      total += queue.tasks.length - queue.head;
    }
    return total;
  }

  private compactLane(queue: LaneQueue): void {
    if (queue.head >= queue.tasks.length) {
      queue.tasks.length = 0;
      queue.head = 0;
      return;
    }

    if (queue.head <= 0) {
      return;
    }

    const remaining = queue.tasks.length - queue.head;
    for (let i = 0; i < remaining; i++) {
      queue.tasks[i] = queue.tasks[queue.head + i];
    }
    queue.tasks.length = remaining;
    queue.head = 0;
  }

  private scheduleFlushKick(): void {
    if (
      this.kickScheduled ||
      !this.scopes.canKick(this.running) ||
      this.isBulkCommitActive() ||
      !this.hasPendingTasks()
    ) {
      return;
    }

    this.kickScheduled = true;
    queueMicrotask(() => {
      this.kickScheduled = false;
      if (
        !this.scopes.canKick(this.running) ||
        this.isBulkCommitActive() ||
        !this.hasPendingTasks()
      ) {
        return;
      }
      try {
        this.flush();
      } catch (err) {
        setTimeout(() => {
          throw err;
        });
      }
    });
  }

  enqueue(task: Task): void {
    this.enqueueInLane('component', task);
  }

  enqueueInLane(lane: SchedulerLane, task: Task): void {
    assertSchedulingPrecondition(
      typeof task === 'function',
      'enqueue() requires a function'
    );

    // Strict rule: during bulk commit, only allow enqueues if runWithSyncProgress enabled
    if (this.isBulkCommitActive() && !this.scopes.allowSyncProgress) {
      ScheduledWork.release(task);
      if (isDevelopmentEnvironment()) {
        throw new Error(
          '[Scheduler] enqueue() during bulk commit (not allowed)'
        );
      }
      return;
    }

    // Enqueue task and account counts
    this.lanes[lane].tasks.push(task);
    this.taskCount++;
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queuedSchedulerWork', 1);
    }

    this.scheduleFlushKick();
  }

  flush(): void {
    invariant(
      !this.running,
      '[Scheduler] flush() called while already running'
    );

    // Dev-only guard: disallow flush during bulk commit unless allowed
    if (isDevelopmentEnvironment()) {
      if (this.isBulkCommitActive() && !this.scopes.allowSyncProgress) {
        throw new Error(
          '[Scheduler] flush() started during bulk commit (not allowed)'
        );
      }
    }

    this.running = true;
    this.depth = 0;
    const failures: unknown[] = [];
    let executedTaskCount = 0;
    const checkFlushDepth = isDevelopmentEnvironment();
    const executionsByTask = checkFlushDepth ? new Map<Task, number>() : null;

    try {
      while (true) {
        let didRunTask = false;

        for (const lane of SCHEDULER_LANES) {
          const laneQueue = this.lanes[lane];
          let executedInLane = 0;

          while (laneQueue.head < laneQueue.tasks.length) {
            const task = laneQueue.tasks[laneQueue.head++];
            if (__ASKR_DEVELOPMENT_BUILD__) {
              adjustOwnershipDiagnostic('queuedSchedulerWork', -1);
            }
            if (executionsByTask) {
              const taskExecutions = (executionsByTask.get(task) ?? 0) + 1;
              executionsByTask.set(task, taskExecutions);
              this.depth = Math.max(this.depth, taskExecutions);
              if (taskExecutions > MAX_FLUSH_DEPTH) {
                throw new Error(
                  `[Scheduler] exceeded MAX_FLUSH_DEPTH (${MAX_FLUSH_DEPTH}). Likely infinite update loop.`
                );
              }
            }

            try {
              this.executionDepth++;
              task();
            } catch (err) {
              failures.push(err);
            } finally {
              // A failed task has still been consumed. Keep scheduler
              // accounting balanced and continue draining siblings so a
              // single user callback cannot strand pending updates or flush
              // waiters.
              if (this.executionDepth > 0) this.executionDepth--;
              executedTaskCount++;
              executedInLane++;
              didRunTask = true;
            }
          }

          if (executedInLane > 0) {
            this.taskCount = Math.max(0, this.taskCount - executedInLane);
          }
        }

        if (!didRunTask) {
          break;
        }
      }
    } finally {
      this.running = false;
      this.depth = 0;
      this.executionDepth = 0;

      for (const lane of SCHEDULER_LANES) {
        const queue = this.lanes[lane];
        if (queue.head > 0) {
          this.compactLane(queue);
        }
      }

      // Advance flush epoch and resolve waiters
      this.completeEpoch();
      recordSchedulerFlushTaskCount(executedTaskCount);
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Scheduler task failures');
    }
  }

  runWithSyncProgress<T>(fn: () => T): T {
    this.scopes.adjustProgress(1);

    // Track whether this scope already completed an explicit flush.
    const startVersion = this.flushVersion;

    try {
      const res = fn();

      // Flush deterministically if tasks were enqueued (and we're not already running)
      if (!this.running && this.hasPendingTasks()) {
        this.flush();
      }

      if (isDevelopmentEnvironment()) {
        if (!this.running && this.hasPendingTasks()) {
          throw new Error(
            '[Scheduler] tasks remain after runWithSyncProgress flush'
          );
        }
      }

      return res;
    } finally {
      this.scopes.adjustProgress(-1);
      // Nested scopes and active flushes have an outer completion owner. A
      // throwing callback may leave work queued; its kick must survive exit.
      if (this.flushVersion === startVersion) this.completeIdleEpoch();
      this.scheduleFlushKick();
    }
  }

  waitForFlush(targetVersion?: number, timeoutMs = 2000): Promise<void> {
    const target =
      typeof targetVersion === 'number' ? targetVersion : this.flushVersion + 1;
    if (this.flushVersion >= target) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const waiter: FlushWaiter = { target, resolve, reject };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        if (waiter.timer !== undefined) clearTimeout(waiter.timer);

        const diag = {
          flushVersion: this.flushVersion,
          queueLen: this.getPendingTaskCount(),
          running: this.running,
          inHandler: this.scopes.inHandler,
          bulk: this.isBulkCommitActive(),
          ...(__ASKR_DEVELOPMENT_BUILD__
            ? {
                namespace:
                  (
                    globalThis as unknown as Record<string, unknown> & {
                      __ASKR__?: Record<string, unknown>;
                    }
                  ).__ASKR__ || {},
              }
            : {}),
        };
        reject(
          new Error(
            `waitForFlush timeout ${timeoutMs}ms: ${JSON.stringify(diag)}`
          )
        );
      }, timeoutMs);

      this.waiters.push(waiter);
    });
  }

  getState() {
    // Provide the compatibility shape expected by diagnostics/tests
    return {
      queueLength: this.getPendingTaskCount(),
      running: this.running,
      depth: this.depth,
      executionDepth: this.executionDepth,
      taskCount: this.taskCount,
      flushVersion: this.flushVersion,
      laneQueues: {
        derived: this.lanes.derived.tasks.length - this.lanes.derived.head,
        component:
          this.lanes.component.tasks.length - this.lanes.component.head,
        reactive: this.lanes.reactive.tasks.length - this.lanes.reactive.head,
        post: this.lanes.post.tasks.length - this.lanes.post.head,
      },
      // New fields for optional inspection
      inHandler: this.scopes.inHandler,
      allowSyncProgress: this.scopes.allowSyncProgress,
    };
  }

  getFlushVersion(): number {
    return this.flushVersion;
  }

  flushIfQueued(): void {
    if (!this.running && this.hasPendingTasks()) {
      this.flush();
    }
  }

  runInHandlerScope<T>(fn: () => T, flushMode: 'defer' | 'sync' = 'defer'): T {
    this.scopes.adjustHandler(1);

    try {
      return fn();
    } finally {
      this.scopes.adjustHandler(-1);

      if (!this.scopes.inHandler) {
        if (flushMode === 'sync') {
          this.flushIfQueued();
        } else {
          this.scheduleFlushKick();
        }
      }
    }
  }

  setInHandler(v: boolean) {
    this.scopes.setHandlerFlag(v);
    if (!v) {
      this.scheduleFlushKick();
    }
  }

  isInHandler(): boolean {
    return this.scopes.inHandler;
  }

  isExecuting(): boolean {
    return this.running || this.executionDepth > 0;
  }

  // Clear pending synchronous tasks (used by fastlane enter/exit)
  clearPendingSyncTasks(): number {
    const remaining = this.getPendingTaskCount();
    if (remaining <= 0) return 0;

    for (const lane of SCHEDULER_LANES) {
      const queue = this.lanes[lane];
      for (let index = queue.head; index < queue.tasks.length; index++)
        ScheduledWork.release(queue.tasks[index]);
      queue.tasks.length = this.running ? queue.head : 0;
      if (!this.running) queue.head = 0;
    }
    this.taskCount = Math.max(0, this.taskCount - remaining);
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('queuedSchedulerWork', -remaining);
    }
    this.completeIdleEpoch();
    return remaining;
  }

  private completeIdleEpoch(): void {
    if (
      !this.running &&
      !this.scopes.allowSyncProgress &&
      !this.hasPendingTasks()
    ) {
      this.completeEpoch();
    }
  }

  private completeEpoch(): void {
    this.flushVersion++;
    this.resolveWaiters();
  }

  private resolveWaiters() {
    if (this.waiters.length === 0) return;
    const ready: Array<() => void> = [];
    const remaining: typeof this.waiters = [];

    for (const w of this.waiters) {
      if (this.flushVersion >= w.target) {
        if (w.timer !== undefined) clearTimeout(w.timer);
        ready.push(w.resolve);
      } else {
        remaining.push(w);
      }
    }

    this.waiters = remaining;
    for (const r of ready) r();
  }
}

export const globalScheduler = new Scheduler();

export function isSchedulerExecuting(): boolean {
  return globalScheduler.isExecuting();
}

export function scheduleEventHandler(handler: EventListener): EventListener {
  return (event: Event) => {
    try {
      globalScheduler.runInHandlerScope(() => {
        handler.call(null, event);
      });
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    }
  };
}
