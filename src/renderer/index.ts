import { captureOwnerRange, releaseOwnerRange } from './ownership/ranges';
import {
  detachPortalHostOutput,
  isComponentHostDetached,
} from './ownership/portal-host';
import {
  clearChildScopeHost,
  captureChildScopeHost,
  resolveScopeBoundary,
  prepareScopeRemoval,
  recordRemovedScopeBoundary,
  teardownScopeHost,
  hasUnmountedComponentHost,
} from './ownership/scope-host';
// Renderer barrel entrypoint.
// Keep this file small: re-export the public surface and provide the runtime
// renderer host used by browser composition.

export * from './types';
export * from './ownership/cleanup';
export {
  keyedElements,
  getKeyMapForElement,
  populateKeyMapForElement,
  _reconcilerRecordedParents,
  isKeyedReorderFastPathEligible,
} from './reconciliation/keyed';
export * from './dom';
export { evaluate, clearDOMRange } from './evaluation/evaluate';
export { withIntrinsicHydrationAdoption } from './hydration/adoption';
export {
  clearDeferredHydrationBoundaries,
  registerDeferredHydrationBoundary,
} from './hydration/boundaries';
export { activateHydrationBoundary } from './dom-internal';

import { evaluate as _evaluate } from './evaluation/evaluate';
import {
  cleanupInstancesUnder,
  teardownNodeSubtree,
} from './ownership/cleanup';
import {
  isKeyedReorderFastPathEligible,
  getKeyMapForElement,
} from './reconciliation/keyed';
import { populateKeyMapForElement } from './reconciliation/keyed';
import { markReactivePropsDirtySource as _markReactivePropsDirtySource } from './dom';
import { replaceComponentRange } from './component/range-commit';
import { getScopeRange } from './control/range-adoption';
import { applyComponentResult } from './component/application';
import { classifyUpdate } from './component/fast-path';
import { recordInlineComponentHost } from './ownership/nodes';
import type { RendererCapabilities } from '../runtime';

export function createRendererCapabilities(): RendererCapabilities {
  return {
    captureComponentHost: captureOwnerRange,
    releaseComponentHost: releaseOwnerRange,
    detachPortalHostOutput,
    isComponentHostDetached,
    clearChildScopeHost,
    captureChildScopeHost,
    resolveScopeBoundary,
    prepareScopeRemoval,
    recordRemovedScopeBoundary,
    teardownScopeHost,
    hasUnmountedComponentHost,
    recordInlineComponentHost,
    applyComponentResult,
    classifyComponentUpdate: classifyUpdate,
    evaluate: _evaluate,
    cleanupInstancesUnder,
    replaceComponentRange,
    resolveChildScopeRange: getScopeRange,
    teardownNodeSubtree,
    populateKeyMapForElement,
    getKeyMapForElement,
    isKeyedReorderFastPathEligible,
    markReactivePropsDirtySource: _markReactivePropsDirtySource,
  };
}
