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
  /** Debug name, shown in the loop-guard error. */
  readonly name?: string | null;
  /** Scheduler bookkeeping: the flush `flushRuns` was counted in. */
  flushStamp?: number;
  /** Scheduler bookkeeping: times this job has run in that flush. */
  flushRuns?: number;
}

export const MAX_RUNS_PER_FLUSH = 50;

/**
 * Jobs a single flush may run beyond the ones queued when it started. Work
 * that fans out as it runs (a render that mounts rows, each queueing its own
 * follow-up) stays far below this; a task that queues a fresh closure on every
 * run, which the per-job counter cannot see, reaches it and is stopped.
 */
export const MAX_FOLLOW_UP_JOBS_PER_FLUSH = 100_000;

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
 * The heap is three parallel arrays, so a push allocates no entry object.
 */
class RenderQueue {
  private jobs: Job[] = [];
  private depths: number[] = [];
  private seqs: number[] = [];
  private seq = 0;

  get length(): number {
    return this.jobs.length;
  }

  push(job: Job): void {
    const { jobs, depths, seqs } = this;
    const depth = job.depth ?? 0;
    const seq = this.seq++;
    let index = jobs.length;
    jobs.push(job);
    depths.push(depth);
    seqs.push(seq);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (
        !(
          depth < depths[parent]! ||
          (depth === depths[parent] && seq < seqs[parent]!)
        )
      ) {
        break;
      }
      jobs[index] = jobs[parent]!;
      depths[index] = depths[parent]!;
      seqs[index] = seqs[parent]!;
      index = parent;
    }
    jobs[index] = job;
    depths[index] = depth;
    seqs[index] = seq;
  }

  shift(): Job | undefined {
    const { jobs, depths, seqs } = this;
    if (jobs.length === 0) return undefined;
    const top = jobs[0]!;
    const last = jobs.pop()!;
    const lastDepth = depths.pop()!;
    const lastSeq = seqs.pop()!;
    const size = jobs.length;
    if (size > 0) {
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        if (left >= size) break;
        const right = left + 1;
        const child =
          right < size &&
          (depths[right]! < depths[left]! ||
            (depths[right] === depths[left] && seqs[right]! < seqs[left]!))
            ? right
            : left;
        if (
          !(
            depths[child]! < lastDepth ||
            (depths[child] === lastDepth && seqs[child]! < lastSeq)
          )
        ) {
          break;
        }
        jobs[index] = jobs[child]!;
        depths[index] = depths[child]!;
        seqs[index] = seqs[child]!;
        index = child;
      }
      jobs[index] = last;
      depths[index] = lastDepth;
      seqs[index] = lastSeq;
    } else {
      this.seq = 0;
    }
    return top;
  }

  clear(): void {
    this.jobs.length = 0;
    this.depths.length = 0;
    this.seqs.length = 0;
    this.seq = 0;
  }
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
const flushWaiters: Array<() => void> = [];

export function schedule(job: Job, lane: Lane): void {
  if (queued.has(job)) return;
  queued.add(job);
  lanes[lane].push(job);
  kick();
}

export function queueTask(fn: () => void): void {
  const owner = getOwner();
  schedule(
    {
      run: () => runWithOwner(owner, fn),
      flushStamp: -1,
      flushRuns: 0,
    },
    'post'
  );
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
        flushStamp: -1,
        flushRuns: 0,
        get name() {
          return computation.name;
        },
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
  let value: T | undefined;
  let callbackError: unknown;
  let callbackFailed = false;
  try {
    value = fn();
  } catch (error) {
    callbackFailed = true;
    callbackError = error;
  }

  batchDepth--;
  let flushError: unknown;
  let flushFailed = false;
  if (batchDepth === 0 && !flushing && queued.size > 0) {
    try {
      flushSync();
    } catch (error) {
      flushFailed = true;
      flushError = error;
    }
  }

  if (callbackFailed && flushFailed) {
    throw new AggregateError(
      [callbackError, flushError],
      'Batch callback and scheduler flush failed'
    );
  }
  if (callbackFailed) throw callbackError;
  if (flushFailed) throw flushError;
  return value as T;
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
  const failures: unknown[] = [];
  const initialJobs = queued.size;
  let executed = 0;
  try {
    for (let job = takeNext(); job; job = takeNext()) {
      queued.delete(job);
      if (job.skip) continue;
      if (++executed - initialJobs > MAX_FOLLOW_UP_JOBS_PER_FLUSH) {
        job.cancel?.();
        dropQueued();
        failures.push(
          new Error(
            `[Askr] scheduler flush exceeded ${MAX_FOLLOW_UP_JOBS_PER_FLUSH} follow-up jobs: a task keeps queueing new tasks. Queued work was dropped.`
          )
        );
        break;
      }
      // Counts live on the job, stamped with the flush they belong to, so a
      // flush allocates no bookkeeping and a job starts at zero each flush.
      const count = job.flushStamp === flushVersion ? job.flushRuns! + 1 : 1;
      job.flushStamp = flushVersion;
      job.flushRuns = count;
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
              `[Askr] exceeded MAX_FLUSH_DEPTH (${MAX_RUNS_PER_FLUSH}): a scheduled update${
                job.name ? ` "${job.name}"` : ''
              } kept re-queueing itself.`
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
  dropQueued();
}

function dropQueued(): void {
  const dropped = [...queued];
  for (const lane of Object.values(lanes)) lane.clear();
  queued.clear();
  for (const job of dropped) job.cancel?.();
}
