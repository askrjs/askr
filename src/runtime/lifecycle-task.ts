import { getComponentLifecycleSlot as getLifecycleSlot } from './component-capabilities';
import { claimHookIndex, getCurrentComponentInstance } from './component-scope';
import { registerCommitOperation } from './component-internal';
import { LifecycleSlot } from './lifecycle-policy';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** Runs an owned task after commit. */
export function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'task');
  const slot = getLifecycleSlot<
    LifecycleSlot & {
      kind: 'task';
      started: boolean;
      task: typeof fn;
    }
  >(instance, index, 'task', () => ({
    kind: 'task',
    started: false,
    task: fn,
  }));

  if (!slot.started) {
    slot.task = fn;
    registerCommitOperation(async () => {
      if (slot.started) {
        return;
      }

      slot.started = true;
      return await slot.task();
    });
  }
}

/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
export function capture<T>(fn: () => T): () => T {
  const value = fn();
  return () => value;
}
