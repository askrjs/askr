import { getComponentLifecycleSlot as getLifecycleSlot } from './component-capabilities';
import { ownCleanup } from './ownership';
import { claimHookIndex, getCurrentComponentInstance } from './component-scope';
import {
  registerCommitOperation,
  type ComponentInstance,
} from './component-internal';
import { adjustOwnershipDiagnostic } from './ownership-diagnostics';
import { ActivityPredicate } from './lifecycle-policy';
import { TimerOptions } from './lifecycle-policy';
import { normalizePredicates } from './lifecycle-policy';
import { allPredicatesPass } from './lifecycle-policy';
import { LifecycleSlot } from './lifecycle-policy';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

interface TimerSlot extends LifecycleSlot {
  kind: 'timer';
  id: ReturnType<typeof setInterval> | null;
  intervalMs: number | null;
  pendingIntervalMs: number;
  callback: () => void;
  predicates: readonly ActivityPredicate[];
  pendingCallback: () => void;
  pendingPredicates: readonly ActivityPredicate[];
  cleanupRegistered: boolean;
}

function stopTimerSlot(slot: TimerSlot): void {
  if (slot.id === null) {
    return;
  }

  clearInterval(slot.id);
  slot.id = null;
  if (__ASKR_DEVELOPMENT_BUILD__) {
    adjustOwnershipDiagnostic('timers', -1);
  }
}

function startTimerSlot(slot: TimerSlot): void {
  slot.id = setInterval(() => {
    if (allPredicatesPass(slot.predicates)) {
      slot.callback();
    }
  }, slot.intervalMs ?? slot.pendingIntervalMs);
  if (__ASKR_DEVELOPMENT_BUILD__) {
    adjustOwnershipDiagnostic('timers', 1);
  }
}

function commitTimerSlot(instance: ComponentInstance, slot: TimerSlot): void {
  const intervalChanged = slot.intervalMs !== slot.pendingIntervalMs;

  slot.callback = slot.pendingCallback;
  slot.predicates = slot.pendingPredicates;

  if (slot.id === null || intervalChanged) {
    stopTimerSlot(slot);
    slot.intervalMs = slot.pendingIntervalMs;
    startTimerSlot(slot);
  }

  if (!slot.cleanupRegistered) {
    slot.cleanupRegistered = true;
    ownCleanup(instance.owner, () => {
      stopTimerSlot(slot);
      slot.cleanupRegistered = false;
    });
  }
}

/** Run `fn` on an owned interval for the current component's lifetime, optionally gated by `options.when`. */
export function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    return;
  }

  const index = claimHookIndex(instance, 'timer');
  const predicates = normalizePredicates(options?.when);
  const slot = getLifecycleSlot<TimerSlot>(instance, index, 'timer', () => ({
    kind: 'timer',
    id: null,
    intervalMs: null,
    pendingIntervalMs: intervalMs,
    callback: fn,
    predicates,
    pendingCallback: fn,
    pendingPredicates: predicates,
    cleanupRegistered: false,
  }));

  slot.pendingIntervalMs = intervalMs;
  slot.pendingCallback = fn;
  slot.pendingPredicates = predicates;

  registerCommitOperation(() => {
    commitTimerSlot(instance, slot);
  });
}
export { TimerSlot, stopTimerSlot, startTimerSlot, commitTimerSlot };
