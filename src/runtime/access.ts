import { logger } from '../common/logger';
import type { ReadableSource } from './reactivity/readable';
import { defaultRuntimeState } from './runtime-state';
import type {
  RendererCapabilities,
  RenderEvaluation,
  RenderCleanup,
  ScopeRendering,
  ReactiveRendering,
  KeyedRendering,
} from './renderer-capabilities';
import type { Scheduler, SchedulerLane } from './scheduler';
import type { ScheduledWork } from './scheduled-work';
export { ScheduledWork } from './scheduled-work';
export { SCHEDULER_LANES } from './scheduler';
import {
  clearCurrentComponentScope,
  endComponentScope,
} from './component/scope';

type RuntimeTask = () => void;

export function getRuntimeScheduler(): Scheduler {
  return defaultRuntimeState.scheduler;
}

/**
 * The whole capability record.
 *
 * Production code must not use this — `tests/checks/architecture.test.ts`
 * rejects any import of it from `src/runtime` or `src/renderer`, so that call
 * sites depend on the one role they need. It exists for tests that need to
 * stand in for, or assert on, the installed renderer as a whole.
 */
export function getRuntimeRenderer(): RendererCapabilities {
  return defaultRuntimeState.renderer;
}

export function getRuntimeEvaluation(): RenderEvaluation {
  return defaultRuntimeState.renderer;
}
export function getRuntimeCleanup(): RenderCleanup {
  return defaultRuntimeState.renderer;
}
export function getRuntimeScopes(): ScopeRendering {
  return defaultRuntimeState.renderer;
}
export function getRuntimeKeys(): KeyedRendering {
  return defaultRuntimeState.renderer;
}
/** Not exported: `markRuntimeReactivePropsDirtySource` is its only caller. */
function getRuntimeReactivity(): ReactiveRendering {
  return defaultRuntimeState.renderer;
}

/** Native boot composition does not require a published extension view. */
export function installRuntimeRenderer(renderer: RendererCapabilities): void {
  defaultRuntimeState.renderer = renderer;
}

export function enqueueRuntimeTask(task: RuntimeTask): void {
  getRuntimeScheduler().enqueue(task);
}

export function enqueueRuntimeLane(
  lane: SchedulerLane,
  task: RuntimeTask
): void {
  getRuntimeScheduler().enqueueInLane(lane, task);
}

export function requestRuntimeWork(
  lane: SchedulerLane,
  work: ScheduledWork
): void {
  work.request(getRuntimeScheduler(), lane);
}

export function runRuntimeHandlerScope<T>(
  fn: () => T,
  flushMode: 'defer' | 'sync' = 'defer'
): T {
  const savedScope = clearCurrentComponentScope();
  try {
    return getRuntimeScheduler().runInHandlerScope(fn, flushMode);
  } finally {
    endComponentScope(savedScope);
  }
}

export function runRuntimeWithSyncProgress<T>(fn: () => T): T {
  return getRuntimeScheduler().runWithSyncProgress(fn);
}

export function getRuntimeSchedulerState(): ReturnType<Scheduler['getState']> {
  return getRuntimeScheduler().getState();
}

export function isRuntimeSchedulerExecuting(): boolean {
  return getRuntimeScheduler().isExecuting();
}

export function getRuntimeFlushVersion(): number {
  return getRuntimeScheduler().getFlushVersion();
}

export function flushRuntimeScheduler(): void {
  getRuntimeScheduler().flush();
}

export function setRuntimeBulkCommitProbe(probe: () => boolean): void {
  getRuntimeScheduler().setBulkCommitProbe(probe);
}

export function markRuntimeReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  getRuntimeReactivity().markReactivePropsDirtySource(source);
}

/**
 * Wrap an event listener so its work runs inside a scheduler handler scope.
 *
 * Resolves the active scheduler per call rather than closing over the module
 * singleton, so a runtime constructed with its own scheduler schedules its own
 * handlers.
 */
export function scheduleEventHandler(handler: EventListener): EventListener {
  return (event: Event) => {
    try {
      getRuntimeScheduler().runInHandlerScope(() => {
        handler.call(null, event);
      });
    } catch (error) {
      logger.error('[Askr] Event handler error:', error);
    }
  };
}
