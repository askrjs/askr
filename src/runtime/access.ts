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
import {
  clearCurrentComponentScope,
  restoreCurrentComponentScope,
} from './component/scope';

type RuntimeTask = () => void;

export function getRuntimeScheduler(): Scheduler {
  return defaultRuntimeState.scheduler;
}

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
export function getRuntimeReactivity(): ReactiveRendering {
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

export function runRuntimeHandlerScope<T>(
  fn: () => T,
  flushMode: 'defer' | 'sync' = 'defer'
): T {
  const savedScope = clearCurrentComponentScope();
  try {
    return getRuntimeScheduler().runInHandlerScope(fn, flushMode);
  } finally {
    restoreCurrentComponentScope(savedScope);
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
