import type { Scheduler, SchedulerLane } from './scheduler';

const workByTask = new WeakMap<() => void, ScheduledWork>();

// One ticket per subsystem flush. Scheduler rejection/cancellation releases it;
// execution releases it before user code so reentrant writes can schedule again.
export class ScheduledWork {
  private pending = false;
  private readonly task: () => void;

  constructor(run: () => void) {
    this.task = () => {
      this.pending = false;
      run();
    };
    workByTask.set(this.task, this);
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
  }
}
