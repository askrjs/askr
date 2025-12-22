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

import { assertSchedulingPrecondition, invariant } from '../dev/invariant';
import { logger } from '../dev/logger';

const MAX_FLUSH_DEPTH = 50;

type Task = () => void;

function isBulkCommitActive(): boolean {
  try {
    const fb = (
      globalThis as {
        __ASKR_FASTLANE?: { isBulkCommitActive?: () => boolean };
      }
    ).__ASKR_FASTLANE;
    return typeof fb?.isBulkCommitActive === 'function'
      ? !!fb.isBulkCommitActive()
      : false;
  } catch (e) {
    void e;
    return false;
  }
}

export class Scheduler {
  private q: Task[] = [];
  private head = 0;

  private running = false;
  private inHandler = false;
  private depth = 0;
  private executionDepth = 0; // for compat with existing diagnostics

  // Monotonic flush version increments at end of each flush
  private flushVersion = 0;

  // Best-effort microtask kick scheduling
  private kickScheduled = false;

  // Escape hatch flag for runWithSyncProgress
  private allowSyncProgress = false;

  // Waiters waiting for flushVersion >= target
  private waiters: Array<{
    target: number;
    resolve: () => void;
    reject: (err: unknown) => void;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  // Keep a lightweight taskCount for compatibility/diagnostics
  private taskCount = 0;

  enqueue(task: Task): void {
    assertSchedulingPrecondition(
      typeof task === 'function',
      'enqueue() requires a function'
    );

    // Strict rule: during bulk commit, only allow enqueues if runWithSyncProgress enabled
    if (isBulkCommitActive() && !this.allowSyncProgress) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          '[Scheduler] enqueue() during bulk commit (not allowed)'
        );
      }
      return;
    }

    // Enqueue task and account counts
    this.q.push(task);
    this.taskCount++;

    // Microtask kick: best-effort, but avoid if we are in handler or running or bulk commit
    if (
      !this.running &&
      !this.kickScheduled &&
      !this.inHandler &&
      !isBulkCommitActive()
    ) {
      this.kickScheduled = true;
      queueMicrotask(() => {
        this.kickScheduled = false;
        if (this.running) return;
        if (isBulkCommitActive()) return;
        try {
          this.flush();
        } catch (err) {
          setTimeout(() => {
            throw err;
          });
        }
      });
    }
  }

  flush(): void {
    invariant(
      !this.running,
      '[Scheduler] flush() called while already running'
    );

    // Dev-only guard: disallow flush during bulk commit unless allowed
    if (process.env.NODE_ENV !== 'production') {
      if (isBulkCommitActive() && !this.allowSyncProgress) {
        throw new Error(
          '[Scheduler] flush() started during bulk commit (not allowed)'
        );
      }
    }

    this.running = true;
    this.depth = 0;
    let fatal: unknown = null;

    try {
      while (this.head < this.q.length) {
        this.depth++;
        if (
          process.env.NODE_ENV !== 'production' &&
          this.depth > MAX_FLUSH_DEPTH
        ) {
          throw new Error(
            `[Scheduler] exceeded MAX_FLUSH_DEPTH (${MAX_FLUSH_DEPTH}). Likely infinite update loop.`
          );
        }

        const task = this.q[this.head++];
        try {
          this.executionDepth++;
          task();
          this.executionDepth--;
        } catch (err) {
          // ensure executionDepth stays balanced
          if (this.executionDepth > 0) this.executionDepth = 0;
          fatal = err;
          break;
        }

        // Account for executed task in taskCount
        if (this.taskCount > 0) this.taskCount--;
      }
    } finally {
      this.running = false;
      this.depth = 0;
      this.executionDepth = 0;

      // Compact queue
      if (this.head >= this.q.length) {
        this.q.length = 0;
        this.head = 0;
      } else if (this.head > 0) {
        const remaining = this.q.length - this.head;
        if (this.head > 1024 || this.head > remaining) {
          this.q = this.q.slice(this.head);
        } else {
          for (let i = 0; i < remaining; i++) {
            this.q[i] = this.q[this.head + i];
          }
          this.q.length = remaining;
        }
        this.head = 0;
      }

      // Advance flush epoch and resolve waiters
      this.flushVersion++;
      this.resolveWaiters();
    }

    if (fatal) throw fatal;
  }

  runWithSyncProgress<T>(fn: () => T): T {
    const prev = this.allowSyncProgress;
    this.allowSyncProgress = true;

    const g = globalThis as {
      queueMicrotask?: (...args: unknown[]) => void;
      setTimeout?: (...args: unknown[]) => unknown;
    };
    const origQueueMicrotask = g.queueMicrotask;
    const origSetTimeout = g.setTimeout;

    if (process.env.NODE_ENV !== 'production') {
      g.queueMicrotask = () => {
        throw new Error(
          '[Scheduler] queueMicrotask not allowed during runWithSyncProgress'
        );
      };
      g.setTimeout = () => {
        throw new Error(
          '[Scheduler] setTimeout not allowed during runWithSyncProgress'
        );
      };
    }

    // Snapshot flushVersion so we can ensure we always complete an epoch
    const startVersion = this.flushVersion;

    try {
      const res = fn();

      // Flush deterministically if tasks were enqueued (and we're not already running)
      if (!this.running && this.q.length - this.head > 0) {
        this.flush();
      }

      if (process.env.NODE_ENV !== 'production') {
        if (this.q.length - this.head > 0) {
          throw new Error(
            '[Scheduler] tasks remain after runWithSyncProgress flush'
          );
        }
      }

      return res;
    } finally {
      // Restore guarded globals
      if (process.env.NODE_ENV !== 'production') {
        g.queueMicrotask = origQueueMicrotask;
        g.setTimeout = origSetTimeout;
      }

      // If no flush happened during the protected window, complete an epoch so
      // observers (tests) see progress even when fast-lane did synchronous work
      // without enqueuing tasks.
      try {
        if (this.flushVersion === startVersion) {
          this.flushVersion++;
          this.resolveWaiters();
        }
      } catch (e) {
        void e;
      }

      this.allowSyncProgress = prev;
    }
  }

  waitForFlush(targetVersion?: number, timeoutMs = 2000): Promise<void> {
    const target =
      typeof targetVersion === 'number' ? targetVersion : this.flushVersion + 1;
    if (this.flushVersion >= target) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ns = ((globalThis as unknown) as Record<string, unknown> & { __ASKR__?: Record<string, unknown> }).__ASKR__ || {};
        const diag = {
          flushVersion: this.flushVersion,
          queueLen: this.q.length - this.head,
          running: this.running,
          inHandler: this.inHandler,
          bulk: isBulkCommitActive(),
          namespace: ns,
        };
        reject(
          new Error(
            `waitForFlush timeout ${timeoutMs}ms: ${JSON.stringify(diag)}`
          )
        );
      }, timeoutMs);

      this.waiters.push({ target, resolve, reject, timer });
    });
  }

  getState() {
    // Provide the compatibility shape expected by diagnostics/tests
    return {
      queueLength: this.q.length - this.head,
      running: this.running,
      depth: this.depth,
      executionDepth: this.executionDepth,
      taskCount: this.taskCount,
      flushVersion: this.flushVersion,
      // New fields for optional inspection
      inHandler: this.inHandler,
      allowSyncProgress: this.allowSyncProgress,
    };
  }

  setInHandler(v: boolean) {
    this.inHandler = v;
  }

  isInHandler(): boolean {
    return this.inHandler;
  }

  isExecuting(): boolean {
    return this.running || this.executionDepth > 0;
  }

  // Clear pending synchronous tasks (used by fastlane enter/exit)
  clearPendingSyncTasks(): number {
    const remaining = this.q.length - this.head;
    if (remaining <= 0) return 0;

    if (this.running) {
      this.q.length = this.head;
      this.taskCount = Math.max(0, this.taskCount - remaining);
      queueMicrotask(() => {
        try {
          this.flushVersion++;
          this.resolveWaiters();
        } catch (e) {
          void e;
        }
      });
      return remaining;
    }

    this.q.length = 0;
    this.head = 0;
    this.taskCount = Math.max(0, this.taskCount - remaining);
    this.flushVersion++;
    this.resolveWaiters();
    return remaining;
  }

  private resolveWaiters() {
    if (this.waiters.length === 0) return;
    const ready: Array<() => void> = [];
    const remaining: typeof this.waiters = [];

    for (const w of this.waiters) {
      if (this.flushVersion >= w.target) {
        if (w.timer) clearTimeout(w.timer);
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
    globalScheduler.setInHandler(true);
    try {
      handler.call(null, event);
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    } finally {
      globalScheduler.setInHandler(false);
      // If the handler enqueued tasks while we disallowed microtask kicks,
      // ensure we schedule a microtask to flush them now that the handler
      // has completed. This avoids tests timing out waiting for flush.
      const state = globalScheduler.getState();
      if ((state.queueLength ?? 0) > 0 && !state.running) {
        queueMicrotask(() => {
          try {
            if (!globalScheduler.isExecuting()) globalScheduler.flush();
          } catch (err) {
            setTimeout(() => {
              throw err;
            });
          }
        });
      }
    }
  };
}
