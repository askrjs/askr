import type { ReadableSource } from './readable';
import {
  getDefaultRuntime,
  type AskrRuntime,
  type RuntimeRendererHost,
} from './runtime';
import type { Scheduler, SchedulerLane } from './scheduler';
import {
  clearCurrentComponentScope,
  restoreCurrentComponentScope,
} from './component-scope';

type RuntimeTask = () => void;

export function getRuntimeScheduler(): Scheduler {
  return getDefaultRuntime().scheduler;
}

export function getDefaultRuntimeInstance(): AskrRuntime {
  return getDefaultRuntime();
}

export function getRuntimeRenderer(): RuntimeRendererHost {
  return getDefaultRuntime().renderer;
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
  getRuntimeRenderer().markReactivePropsDirtySource(source);
}
