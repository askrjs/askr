/**
 * Component render scope and hook cursor ownership.
 * Internal helpers in this module intentionally keep mutable render-scope
 * state out of component execution and cleanup orchestration.
 */

import type { ReadableSource } from '../reactivity/readable';
import type { ComponentInstance } from './instance';
import type { AppRenderRuntime } from '../../common/app-render-runtime';
import { getOwnershipSignal } from '../ownership/record';

export type ComponentScopeSnapshot = {
  instance: ComponentInstance | null;
  portalScope: object | null;
  stateIndex: number;
};

type InlineRenderTrackingSnapshot = {
  currentRenderToken: number | undefined;
  pendingReadSources: Set<ReadableSource<unknown>> | undefined;
  pendingReadSourceVersions: Map<ReadableSource<unknown>, number> | undefined;
};

let currentInstance: ComponentInstance | null = null;
let currentPortalScope: object | null = null;
let scopedAppRenderRuntime: AppRenderRuntime | undefined;
let stateIndex = 0;
let globalRenderCounter = 0;

function nextRenderToken(): number {
  return ++globalRenderCounter;
}

function captureScope(): ComponentScopeSnapshot {
  return {
    instance: currentInstance,
    portalScope: currentPortalScope,
    stateIndex,
  };
}

function restoreScope(snapshot: ComponentScopeSnapshot): void {
  currentInstance = snapshot.instance;
  currentPortalScope = snapshot.portalScope;
  stateIndex = snapshot.stateIndex;
}

/**
 * Fields to install on entry. An omitted field is left as it is; `portalScope`
 * additionally defaults to the entered instance's own portal scope.
 */
type ComponentScopeEntry = {
  instance?: ComponentInstance | null;
  portalScope?: object | null;
  stateIndex?: number;
};

/**
 * Enter a component scope, returning the snapshot that restores it.
 *
 * The entry describes only what changes; the snapshot always carries all three
 * ambient fields, and `endComponentScope` always restores all three. Callers
 * therefore cannot introduce a variant that saves a subset and leaves the rest
 * pointing at the previous component, which is what the older enter/exit pairs
 * each did differently.
 *
 * Prefer `withComponentScope`. Use this pair directly only where the scope
 * genuinely cannot be expressed as a closure, such as a span across two
 * separately invoked lifecycle phases.
 */
export function beginComponentScope(
  entry: ComponentScopeEntry
): ComponentScopeSnapshot {
  const snapshot = captureScope();
  if ('instance' in entry) {
    const instance = entry.instance ?? null;
    currentInstance = instance;
    currentPortalScope = instance?.portalScope ?? snapshot.portalScope;
  }
  if ('portalScope' in entry) currentPortalScope = entry.portalScope ?? null;
  if (entry.stateIndex !== undefined) stateIndex = entry.stateIndex;
  return snapshot;
}

/** Restore every ambient scope field captured by `beginComponentScope`. */
export function endComponentScope(snapshot: ComponentScopeSnapshot): void {
  restoreScope(snapshot);
}

/** Run `fn` inside a component scope, restoring the previous scope on any exit. */
export function withComponentScope<T>(
  entry: ComponentScopeEntry,
  fn: () => T
): T {
  const snapshot = beginComponentScope(entry);
  try {
    return fn();
  } finally {
    endComponentScope(snapshot);
  }
}

export function getCurrentComponentInstance(): ComponentInstance | null {
  return currentInstance;
}

export function getCurrentAppRenderRuntime(): AppRenderRuntime | undefined {
  let instance = currentInstance;
  while (instance) {
    if (instance._appRenderRuntime) return instance._appRenderRuntime;
    instance = instance.parentInstance;
  }
  return scopedAppRenderRuntime;
}

/** @internal Preserve root ownership without exposing component hook scope. */
export function withAppRenderRuntime<T>(
  runtime: AppRenderRuntime | undefined,
  fn: () => T
): T {
  const previous = scopedAppRenderRuntime;
  scopedAppRenderRuntime = runtime;
  try {
    return fn();
  } finally {
    scopedAppRenderRuntime = previous;
  }
}

export function getCurrentPortalScope(): object | null {
  return currentInstance?.portalScope ?? currentPortalScope;
}

export function getSignalForInstance(instance: ComponentInstance): AbortSignal {
  return getOwnershipSignal(instance.owner);
}

/**
 * Get the abort signal for the current component.
 *
 * The signal is guaranteed to be aborted when:
 * - Component unmounts
 * - Navigation occurs (different route)
 * - Parent is destroyed
 */
export function getSignal(): AbortSignal {
  if (!currentInstance) {
    throw new Error(
      'getSignal() can only be called during component render execution. ' +
        'Ensure you are calling this from inside your component function.'
    );
  }
  return getSignalForInstance(currentInstance);
}

export function resetRenderState(instance: ComponentInstance): void {
  instance.stateIndexCheck = -1;

  for (const state of instance.stateValues ?? []) {
    if (state) {
      state._hasBeenRead = false;
    }
  }

  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
}

export function beginRenderTracking(instance: ComponentInstance): void {
  instance.renderRevision = (instance.renderRevision ?? 0) + 1;
  instance._currentRenderToken = nextRenderToken();
  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
}

export function clearRenderTracking(instance: ComponentInstance): void {
  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
  instance._currentRenderToken = undefined;
}

export function captureInlineRenderTracking(
  instance: ComponentInstance
): InlineRenderTrackingSnapshot {
  return {
    currentRenderToken: instance._currentRenderToken,
    pendingReadSources: instance._pendingReadSources,
    pendingReadSourceVersions: instance._pendingReadSourceVersions,
  };
}

export function restoreInlineRenderTracking(
  instance: ComponentInstance,
  snapshot: InlineRenderTrackingSnapshot
): void {
  instance._currentRenderToken = snapshot.currentRenderToken;
  instance._pendingReadSources = snapshot.pendingReadSources;
  instance._pendingReadSourceVersions = snapshot.pendingReadSourceVersions;
}

export function enterRenderScopedComponent(
  instance: ComponentInstance,
  startStateIndex: number
): ComponentScopeSnapshot {
  return beginComponentScope({ instance, stateIndex: startStateIndex });
}

export function captureInlineComponentScope(): ComponentScopeSnapshot {
  return beginComponentScope({});
}

export function enterComponentExecutionScope(
  instance: ComponentInstance
): ComponentScopeSnapshot {
  return beginComponentScope({ instance, stateIndex: 0 });
}

export function enterDomCommitScope(
  instance: ComponentInstance
): ComponentScopeSnapshot {
  return beginComponentScope({ instance });
}

export function clearCurrentComponentScope(): ComponentScopeSnapshot {
  return beginComponentScope({ instance: null, portalScope: null });
}

export function getNextStateIndex(): number {
  return stateIndex++;
}

function hookOrderGuidance(hookName: string): string {
  return (
    `The render-scoped hook sequence changed between renders. ` +
    `This can happen when ${hookName}() is called conditionally, or when a conditional subtree ` +
    `skips an outer control boundary through a plain if, ternary, && branch, or loop. ` +
    `Keep render-scoped hooks and their outer control boundaries unconditional. ` +
    `Use <Show> or <Case> with <Match> children for conditional branches, ` +
    `and <For> for changing collections.`
  );
}

export function claimHookIndex(
  instance: ComponentInstance,
  hookName: string
): number {
  const index = getNextStateIndex();

  if (index < instance.stateIndexCheck) {
    throw new Error(
      `Hook index violation: ${hookName}() call at index ${index}, ` +
        `but previously saw index ${instance.stateIndexCheck}. ` +
        hookOrderGuidance(hookName)
    );
  }

  instance.stateIndexCheck = index;

  const expectedStateIndices = (instance.expectedStateIndices ??= []);

  if (instance.firstRenderComplete) {
    if (expectedStateIndices[index] !== index) {
      throw new Error(
        `Hook order violation: ${hookName}() called at index ${index}, ` +
          `but this index was not in the first render's sequence [${expectedStateIndices.join(', ')}]. ` +
          hookOrderGuidance(hookName)
      );
    }
  } else {
    expectedStateIndices.push(index);
  }

  return index;
}

export function getCurrentStateIndex(): number {
  return stateIndex;
}
