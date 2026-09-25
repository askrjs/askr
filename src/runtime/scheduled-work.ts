import type { Scheduler, SchedulerLane } from './scheduler';

const workByTask = new WeakMap<() => void, ScheduledWork>();
const releaseByTask = new WeakMap<() => void, () => void>();
const batchTasks = new WeakSet<() => void>();

// Register how a plain queued task resets its owner's pending state when the
// scheduler discards it without running it.
export function onScheduledTaskRelease(
  task: () => void,
  release: () => void
): void {
  releaseByTask.set(task, release);
}

// Batch work drains a shared dirty set. Dropping it would strand every
// unrelated dirty entry, so the scheduler's task-level loop guard skips it;
// each batch instead counts runs per entry (effect, derived cell, selector
// record) across the whole flush and skips only the looping entry.
export function isBatchScheduledTask(task: () => void): boolean {
  return batchTasks.has(task);
}

// One ticket per subsystem flush. Scheduler rejection/cancellation releases it;
// execution releases it before user code so reentrant writes can schedule again.
export class ScheduledWork {
  private pending = false;
  private readonly task: () => void;

  constructor(run: () => void, batch = false) {
    this.task = () => {
      this.pending = false;
      run();
    };
    workByTask.set(this.task, this);
    if (batch) batchTasks.add(this.task);
  }

  request(scheduler: Scheduler, lane: SchedulerLane): void {
    if (this.pending) return;
    this.pending = true;
    try {
      scheduler.enqueueInLane(lane, this.task);
    } catch (error) {
      this.cancel();
      throw error;
    }
  }

  // Overrides may only reset internal ownership, never throw or call user code.
  protected cancel(): void {
    this.pending = false;
  }

  static release(task: () => void): void {
    workByTask.get(task)?.cancel();
    releaseByTask.get(task)?.();
  }
}
