/**
 * Scheduler.
 *
 * Stale computations queue into one of three lanes and a flush drains them in
 * order, repeating until nothing is queued:
 *
 * - `render`: component and control renders, shallowest first, so a parent
 *   re-render can absorb or remove a child before the child runs on its own.
 * - `effect`: fine-grained DOM bindings.
 * - `post`: work that follows a commit (`task()`, `watch()`, resource starts).
 *
 * Plain callbacks queued with `queueTask()` run in the `post` lane.
 * A flush never re-enters itself. Failures are collected; the flush finishes
 * and then throws them (one error as-is, several as an AggregateError).
 */

import type { Computation } from './graph';
import { getOwner, runWithOwner } from './owner';

export type Lane = 'render' | 'effect' | 'post';

export interface Job {
  /** Depth in the owner tree; the render lane runs shallow jobs first. */
  depth?: number;
  run(): void;
  /** A disposed or already-satisfied job is skipped. */
  readonly skip?: boolean;
  /** Called when the job is dropped without running (scheduler cleared). */
  cancel?(): void;
  /** Handle a repeatedly queued job at the per-flush limit. */
  onLimit?(): void;
  /** A lower limit when this job can repeatedly trigger render work. */
  maxRuns?: number;
}

export const MAX_RUNS_PER_FLUSH = 50;

/** FIFO queue with an advancing head, so taking the next job is O(1). */
class JobQueue {
  private items: Job[] = [];
  private head = 0;

  get length(): number {
    return this.items.length - this.head;
  }

  push(job: Job): void {
    this.items.push(job);
  }

  shift(): Job | undefined {
    if (this.head >= this.items.length) return undefined;
    const job = this.items[this.head];
    this.items[this.head++] = undefined as unknown as Job;
    if (this.head === this.items.length) {
      this.items.length = 0;
      this.head = 0;
    } else if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return job;
  }

  clear(): void {
    this.items.length = 0;
    this.head = 0;
  }
}

/**
 * Render lane: a binary min-heap ordered by depth, then by queue order, so the
 * shallowest job runs first and equal depths run in the order they queued.
 */
class RenderQueue {
  private heap: Array<{ job: Job; depth: number; seq: number }> = [];
  private seq = 0;

  get length(): number {
    return this.heap.length;
  }

  push(job: Job): void {
    const heap = this.heap;
    const entry = { job, depth: job.depth ?? 0, seq: this.seq++ };
    let index = heap.push(entry) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!before(entry, heap[parent])) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = entry;
  }

  shift(): Job | undefined {
    const heap = this.heap;
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child =
          right < heap.length && before(heap[right], heap[left]) ? right : left;
        if (!before(heap[child], last)) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    if (heap.length === 0) this.seq = 0;
    return top.job;
  }

  clear(): void {
    this.heap.length = 0;
    this.seq = 0;
  }
}

function before(
  a: { depth: number; seq: number },
  b: { depth: number; seq: number }
): boolean {
  return a.depth < b.depth || (a.depth === b.depth && a.seq < b.seq);
}

const lanes = {
  render: new RenderQueue(),
  effect: new JobQueue(),
  post: new JobQueue(),
};
const queued = new Set<Job>();
let flushing = false;
let batchDepth = 0;
let kickScheduled = false;
let flushVersion = 0;
let runCounts: Map<Job, number> | null = null;
const flushWaiters: Array<() => void> = [];

export function schedule(job: Job, lane: Lane): void {
  if (queued.has(job)) return;
  queued.add(job);
  lanes[lane].push(job);
  kick();
}

export function queueTask(fn: () => void): void {
  const owner = getOwner();
  schedule({ run: () => runWithOwner(owner, fn) }, 'post');
}

const computationJobs = new WeakMap<Computation, Job>();

/**
 * A scheduler for computations that run as effects: when one goes stale it
 * is queued in `lane` and brought up to date (re-running only if a source
 * actually changed) when the flush reaches it.
 */
export function effectScheduler(
  lane: Lane,
  depth = 0,
  onLimit?: () => void,
  maxRuns?: number
) {
  return (computation: Computation): void => {
    let job = computationJobs.get(computation);
    if (!job) {
      job = {
        depth,
        run: () => computation.update(),
        cancel: () => computation.dropScheduled(),
        onLimit,
        maxRuns,
        get skip() {
          return computation.disposed;
        },
      };
      computationJobs.set(computation, job);
    }
    schedule(job, lane);
  };
}

export function isFlushing(): boolean {
  return flushing;
}

export function hasPendingWork(): boolean {
  return queued.size > 0;
}

function kick(): void {
  if (flushing || batchDepth > 0 || kickScheduled) return;
  kickScheduled = true;
  queueMicrotask(() => {
    kickScheduled = false;
    if (!flushing && batchDepth === 0 && queued.size > 0) {
      flushSync();
    }
  });
}

/**
 * Run `fn` with scheduling deferred, then flush synchronously when the
 * outermost batch exits. Event handlers run inside a batch.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && !flushing && queued.size > 0) flushSync();
  }
}

function takeNext(): Job | null {
  return (
    lanes.render.shift() ?? lanes.effect.shift() ?? lanes.post.shift() ?? null
  );
}

/** Drain every queued job now. Nested calls during a flush are no-ops. */
export function flushSync(): void {
  if (flushing) return;
  flushing = true;
  runCounts = new Map();
  const failures: unknown[] = [];
  try {
    for (let job = takeNext(); job; job = takeNext()) {
      queued.delete(job);
      if (job.skip) continue;
      const count = (runCounts.get(job) ?? 0) + 1;
      runCounts.set(job, count);
      if (count > (job.maxRuns ?? MAX_RUNS_PER_FLUSH)) {
        job.cancel?.();
        if (job.onLimit) {
          try {
            job.onLimit();
          } catch (error) {
            failures.push(error);
          }
        } else {
          failures.push(
            new Error(
              `[Askr] exceeded MAX_FLUSH_DEPTH (${MAX_RUNS_PER_FLUSH}): a scheduled update kept re-queueing itself.`
            )
          );
        }
        continue;
      }
      try {
        job.run();
      } catch (error) {
        failures.push(error);
      }
    }
  } finally {
    flushing = false;
    runCounts = null;
    flushVersion++;
    for (const resolve of flushWaiters.splice(0)) resolve();
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Scheduler flush failed');
  }
}

/** Queue depth and flush status, for test and diagnostic observation. */
export function getSchedulerState(): {
  queueLength: number;
  running: boolean;
  flushVersion: number;
  laneQueues: Record<Lane, number>;
} {
  return {
    queueLength: queued.size,
    running: flushing,
    flushVersion,
    laneQueues: {
      render: lanes.render.length,
      effect: lanes.effect.length,
      post: lanes.post.length,
    },
  };
}

export function getFlushVersion(): number {
  return flushVersion;
}

/** Resolve after the next flush completes (immediately if nothing is queued). */
export function waitForFlush(): Promise<void> {
  if (!flushing && queued.size === 0) return Promise.resolve();
  return new Promise((resolve) => flushWaiters.push(resolve));
}

/** Drop all queued work (test isolation). */
export function clearScheduler(): void {
  const dropped = [...queued];
  for (const lane of Object.values(lanes)) lane.clear();
  queued.clear();
  for (const job of dropped) job.cancel?.();
}
