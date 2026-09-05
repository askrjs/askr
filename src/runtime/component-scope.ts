/**
 * Component render scope and hook cursor ownership.
 * Internal helpers in this module intentionally keep mutable render-scope
 * state out of component execution and cleanup orchestration.
 */

import type { ReadableSource } from './readable';
import type { ComponentInstance } from './component-internal';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import { getOwnershipSignal } from './ownership';

type ComponentScopeSnapshot = {
  instance: ComponentInstance | null;
  portalScope: object | null;
  stateIndex: number;
};

type InstancePortalScopeSnapshot = {
  instance: ComponentInstance | null;
  portalScope: object | null;
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
let renderScopedDepth = 0;
let outerRenderScopedInstance: ComponentInstance | null = null;
let outerRenderScopedPortalScope: object | null = null;
let outerRenderScopedStateIndex = 0;

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

function captureInstancePortalScope(): InstancePortalScopeSnapshot {
  return {
    instance: currentInstance,
    portalScope: currentPortalScope,
  };
}

export function getCurrentComponentInstance(): ComponentInstance | null {
  return currentInstance;
}

export function getCurrentInstance(): ComponentInstance | null {
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

export function setCurrentComponentInstance(
  instance: ComponentInstance | null
): void {
  currentInstance = instance;
  currentPortalScope = instance?.portalScope ?? null;
}

export function getCurrentPortalScope(): object | null {
  return currentInstance?.portalScope ?? currentPortalScope;
}

export function getSignalForInstance(instance: ComponentInstance): AbortSignal {
  return getOwnershipSignal(instance.ownership);
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
): ComponentScopeSnapshot | null {
  let savedScope: ComponentScopeSnapshot | null = null;
  if (renderScopedDepth === 0) {
    outerRenderScopedInstance = currentInstance;
    outerRenderScopedPortalScope = currentPortalScope;
    outerRenderScopedStateIndex = stateIndex;
  } else {
    savedScope = captureScope();
  }
  renderScopedDepth += 1;
  currentInstance = instance;
  currentPortalScope =
    instance.portalScope ??
    (savedScope ? savedScope.portalScope : outerRenderScopedPortalScope);
  stateIndex = startStateIndex;
  return savedScope;
}

export function restoreRenderScopedComponent(
  snapshot: ComponentScopeSnapshot | null
): void {
  renderScopedDepth -= 1;
  if (snapshot) {
    restoreScope(snapshot);
    return;
  }

  currentInstance = outerRenderScopedInstance;
  currentPortalScope = outerRenderScopedPortalScope;
  stateIndex = outerRenderScopedStateIndex;
  outerRenderScopedInstance = null;
  outerRenderScopedPortalScope = null;
  outerRenderScopedStateIndex = 0;
}

export function captureInlineComponentScope(): InstancePortalScopeSnapshot {
  return captureInstancePortalScope();
}

export function restoreInlineComponentScope(
  snapshot: InstancePortalScopeSnapshot
): void {
  currentInstance = snapshot.instance;
  currentPortalScope = snapshot.portalScope;
}

export function enterComponentExecutionScope(
  instance: ComponentInstance
): object | null {
  const savedPortalScope = currentPortalScope;
  currentInstance = instance;
  currentPortalScope = instance.portalScope ?? savedPortalScope;
  stateIndex = 0;
  return savedPortalScope;
}

export function exitComponentExecutionScope(
  savedPortalScope: object | null
): void {
  currentInstance = null;
  currentPortalScope = savedPortalScope;
}

export function enterDomCommitScope(
  instance: ComponentInstance
): ComponentInstance | null {
  const previousInstance = currentInstance;
  currentInstance = instance;
  return previousInstance;
}

export function restoreDomCommitScope(
  previousInstance: ComponentInstance | null
): void {
  currentInstance = previousInstance;
}

export function clearCurrentComponentScope(): ComponentScopeSnapshot {
  const savedScope = captureScope();
  currentInstance = null;
  currentPortalScope = null;
  return savedScope;
}

export function restoreCurrentComponentScope(
  snapshot: ComponentScopeSnapshot
): void {
  restoreScope(snapshot);
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

export function resetStateIndex(): void {
  stateIndex = 0;
}

export function setStateIndex(value: number): void {
  stateIndex = value;
}
