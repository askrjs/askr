/**
 * Serialized update scheduler
 * Ensures deterministic, batched execution
 * Includes guards against infinite render loops
 *
 * ACTOR MODEL INVARIANTS:
 * - Single mailbox: all updates go through enqueue()
 * - No reentrancy: each task runs to completion before next dequeues
 * - Deterministic ordering: tasks execute in the order enqueued
 * - No render bypass: ALL DOM mutations (including synchronous ones) must be enqueued
 * - Max depth guard: prevents infinite render loops
 * - Task isolation: each task runs to completion before next starts
 *
 * This guarantees:
 * - No interleaving of renders and state mutations
 * - Predictable ordering even with async operations
 * - Provable serialization: one message at a time
 * - Finite execution: max depth prevents infinite loops
 */

import { assertSchedulingPrecondition, invariant } from '../dev/invariant';
import { logger } from '../dev/logger';

const MAX_RENDER_DEPTH = 25; // Prevent infinite render loops

export class Scheduler {
  private queue: (() => void)[] = [];
  private running = false;
  private depth = 0;
  private executionDepth = 0; // Track whether we are inside scheduler execution
  private lastTaskTime: number = 0;
  private taskCount: number = 0;
  private inHandler = false;

  /**
   * Enqueue a task through the single mailbox
   * INVARIANT: Every state mutation and DOM update goes here
   */
  enqueue(task: () => void): void {
    // INVARIANT: task must be a function
    assertSchedulingPrecondition(
      typeof task === 'function',
      'enqueue() requires a function, got ' + typeof task
    );

    // Invariants: fast-lane bulk commit must not enqueue tasks
    if (process.env.NODE_ENV !== 'production') {
      const fastlaneBridge = (
        globalThis as unknown as {
          __ASKR_FASTLANE?: { isBulkCommitActive?: () => boolean };
        }
      ).__ASKR_FASTLANE;
      if (
        fastlaneBridge &&
        typeof fastlaneBridge.isBulkCommitActive === 'function' &&
        fastlaneBridge.isBulkCommitActive()
      ) {
        throw new Error(
          '[Scheduler] enqueue() called during bulk commit fast-lane'
        );
      }
    }

    this.queue.push(task);
    this.taskCount++;

    // Only start flush if not already running and not in handler (handlers defer flush)
    if (!this.running && !this.inHandler) {
      this.flush();
    }
  }

  /**
   * Check if currently executing a task
   * Used to validate that mutations only happen during execution
   */
  isExecuting(): boolean {
    return this.executionDepth > 0;
  }

  /**
   * Get scheduler state for debugging/testing
   */
  getState() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      depth: this.depth,
      executionDepth: this.executionDepth,
      taskCount: this.taskCount,
    };
  }

  /**
   * Flush all queued tasks in order
   * INVARIANT: No task can run until all previous tasks complete
   */
  flush(): void {
    // INVARIANT: flush() is not reentrant
    invariant(
      !this.running,
      '[Scheduler] flush() called while already running'
    );

    this.running = true;
    this.depth = 0;
    let fatalError: unknown = null;

    try {
      while (this.queue.length > 0) {
        this.depth++;

        // INVARIANT: Detect infinite render loops
        // If depth exceeds max, something is wrong (likely state.set() in render)
        // NOTE: Skip invariant checks in production for graceful degradation
        if (
          this.depth > MAX_RENDER_DEPTH &&
          process.env.NODE_ENV !== 'production'
        ) {
          throw new Error(
            `[Scheduler] Exceeded maximum render depth (${MAX_RENDER_DEPTH}). ` +
              'This indicates state.set() is being called during component render, ' +
              'causing infinite re-renders. Refactor your component to avoid state mutations during render. ' +
              'Move side effects to event handlers or use conditional rendering instead.'
          );
        }

        const task = this.queue.shift();

        // INVARIANT: task always exists if queue.length > 0
        invariant(
          task !== undefined,
          '[Scheduler] Task should exist after queue.length check'
        );

        this.executionDepth++;
        this.lastTaskTime = Date.now();

        try {
          // INVARIANT: Task runs to completion before next task starts
          // if (process.env.NODE_ENV !== 'production') {
          //   logger.debug('Executing task in scheduler');
          // }
          task!();
        } catch (error) {
          // INVARIANT: Task errors don't prevent cleanup
          this.executionDepth--;
          // Capture error to rethrow after cleanup
          fatalError = error;
          break; // Exit the loop to run finally block
        }

        // INVARIANT: executionDepth must be decremented even if task throws
        this.executionDepth--;

        // INVARIANT: depth only increases monotonically during a flush
        invariant(
          this.depth >= 1,
          '[Scheduler] Depth should be at least 1 during execution'
        );
      }
    } finally {
      // INVARIANT: Always cleanup scheduler state, even on error
      this.running = false;
      this.depth = 0;
      this.executionDepth = 0;
    }

    // Re-throw after cleanup to preserve error semantics
    if (fatalError) {
      throw fatalError;
    }
  }

  setInHandler(value: boolean): void {
    this.inHandler = value;
  }

  isInHandler(): boolean {
    return this.inHandler;
  }
}

export const globalScheduler = new Scheduler();

/**
 * Check if we are currently executing within the scheduler
 * Used for dev-mode validation that state mutations only occur within scheduled tasks
 *
 * @returns true if inside scheduler.flush(), false otherwise
 */
export function isSchedulerExecuting(): boolean {
  return globalScheduler.isExecuting();
}

/**
 * Wrap an event handler to execute through the scheduler
 * Ensures all event-driven state updates are serialized and deterministic
 *
 * NOTE: This helper *enqueues* the handler to run inside the scheduler flush.
 * This is different from the DOM's default handler-wrapping, which runs handlers
 * synchronously but temporarily sets `inHandler` to defer the scheduler flush
 * until after the handler completes. Use `scheduleEventHandler` when you want
 * the handler itself to run inside the scheduler boundary.
 *
 * @example
 * ```ts
 * const wrappedHandler = scheduleEventHandler((e) => {
 *   count.set(count() + 1);
 * });
 * element.addEventListener('click', wrappedHandler);
 * ```
 */
/**
 * Wrap an event handler to run synchronously (default unified model).
 *
 * Behavior: the handler executes immediately (synchronously) and the
 * scheduler is marked `inHandler` during its execution so any scheduler
 * flushes are deferred until the handler completes. This preserves
 * synchronous read semantics while keeping commits serialized.
 *
 * NOTE: This unifies the previous two models into a single default. If you
 * previously relied on handlers being enqueued into the scheduler, wrap the
 * handler yourself with `() => globalScheduler.enqueue(...)`.
 */
export function scheduleEventHandler(handler: EventListener): EventListener {
  return (event: Event) => {
    globalScheduler.setInHandler(true);
    try {
      handler.call(null, event);
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    } finally {
      globalScheduler.setInHandler(false);
    }
  };
}
