import { releaseOwnerRange } from './dom-range';
import { detachPortalHostOutput, isComponentHostDetached } from './portal-host';
import {
  clearChildScopeHost,
  captureChildScopeHost,
  resolveScopeBoundary,
  prepareScopeRemoval,
  recordRemovedScopeBoundary,
  teardownScopeHost,
  hasUnmountedComponentHost,
} from './scope-host';
// Renderer barrel entrypoint.
// Keep this file small: re-export the public surface and provide the runtime
// renderer host used by browser composition.

export * from './types';
export * from './cleanup';
export {
  keyedElements,
  getKeyMapForElement,
  populateKeyMapForElement,
  _reconcilerRecordedParents,
  isKeyedReorderFastPathEligible,
} from './keyed';
export * from './dom';
export { evaluate, clearDOMRange } from './evaluate';
export { withIntrinsicHydrationAdoption } from './intrinsic-hydration-adoption';
export {
  clearDeferredHydrationBoundaries,
  registerDeferredHydrationBoundary,
} from './hydration-boundaries';
export { activateHydrationBoundary } from './dom-internal';

import { evaluate as _evaluate } from './evaluate';
import { cleanupInstancesUnder, teardownNodeSubtree } from './cleanup';
import { isKeyedReorderFastPathEligible, getKeyMapForElement } from './keyed';
import { populateKeyMapForElement } from './keyed';
import { markReactivePropsDirtySource as _markReactivePropsDirtySource } from './dom';
import { replaceComponentRange } from './component-range-commit';
import { getScopeRange } from './boundary-range-adoption';
import { applyComponentResult } from './component-application';
import { classifyUpdate } from './component-fast-path';
import { recordInlineComponentHost } from './dom-ownership';
import type { RendererCapabilities } from '../runtime';

export function createRendererCapabilities(): RendererCapabilities {
  return {
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
