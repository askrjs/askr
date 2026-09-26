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

export type Lane = 'render' | 'effect' | 'post';

export interface Job {
  /** Depth in the owner tree; the render lane runs shallow jobs first. */
  depth?: number;
  run(): void;
  /** A disposed or already-satisfied job is skipped. */
  readonly skip?: boolean;
}

export const MAX_RUNS_PER_FLUSH = 50;

const lanes: Record<Lane, Job[]> = { render: [], effect: [], post: [] };
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
  schedule({ run: fn }, 'post');
}

const computationJobs = new WeakMap<Computation, Job>();

/**
 * A scheduler for computations that run as effects: when one goes stale it
 * is queued in `lane` and brought up to date (re-running only if a source
 * actually changed) when the flush reaches it.
 */
export function effectScheduler(lane: Lane, depth = 0) {
  return (computation: Computation): void => {
    let job = computationJobs.get(computation);
    if (!job) {
      job = {
        depth,
        run: () => computation.update(),
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
  const render = lanes.render;
  if (render.length) {
    let best = 0;
    for (let i = 1; i < render.length; i++) {
      if ((render[i].depth ?? 0) < (render[best].depth ?? 0)) best = i;
    }
    return render.splice(best, 1)[0];
  }
  if (lanes.effect.length) return lanes.effect.shift()!;
  if (lanes.post.length) return lanes.post.shift()!;
  return null;
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
      if (count > MAX_RUNS_PER_FLUSH) {
        failures.push(
          new Error(
            `[Askr] exceeded MAX_FLUSH_DEPTH (${MAX_RUNS_PER_FLUSH}): a scheduled update kept re-queueing itself.`
          )
        );
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
  for (const lane of Object.values(lanes)) lane.length = 0;
  queued.clear();
}
