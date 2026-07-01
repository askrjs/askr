/**
 * Component render scope and hook cursor ownership.
 * Internal helpers in this module intentionally keep mutable render-scope
 * state out of component execution and cleanup orchestration.
 */

import type { ReadableSource } from './readable';
import type { ComponentInstance } from './component-internal';

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
let stateIndex = 0;
let globalRenderCounter = 0;

function ensureAbortController(instance: ComponentInstance): AbortController {
  let controller = instance.abortController;
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    instance.abortController = controller;
  }
  return controller;
}

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
  return ensureAbortController(instance).signal;
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

  for (const state of instance.stateValues) {
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
): ComponentScopeSnapshot {
  const savedScope = captureScope();
  currentInstance = instance;
  currentPortalScope = instance.portalScope ?? savedScope.portalScope;
  stateIndex = startStateIndex;
  return savedScope;
}

export function restoreRenderScopedComponent(
  snapshot: ComponentScopeSnapshot
): void {
  restoreScope(snapshot);
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

export function claimHookIndex(
  instance: ComponentInstance,
  hookName: string
): number {
  const index = getNextStateIndex();

  if (index < instance.stateIndexCheck) {
    throw new Error(
      `Hook index violation: ${hookName}() call at index ${index}, ` +
        `but previously saw index ${instance.stateIndexCheck}. ` +
        `This happens when render-scoped hooks are called conditionally (inside if/for/etc). ` +
        `Move all ${hookName}() calls to the top level of your component function, ` +
        `before any conditionals.`
    );
  }

  instance.stateIndexCheck = index;

  if (instance.firstRenderComplete) {
    if (instance.expectedStateIndices[index] !== index) {
      throw new Error(
        `Hook order violation: ${hookName}() called at index ${index}, ` +
          `but this index was not in the first render's sequence [${instance.expectedStateIndices.join(', ')}]. ` +
          `This usually means ${hookName}() is inside a conditional or loop. ` +
          `Move all render-scoped hooks to the top level of your component function.`
      );
    }
  } else {
    instance.expectedStateIndices.push(index);
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
