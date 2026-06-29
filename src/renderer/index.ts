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

import { evaluate as _evaluate } from './evaluate';
import { cleanupInstancesUnder, teardownNodeSubtree } from './cleanup';
import { isKeyedReorderFastPathEligible, getKeyMapForElement } from './keyed';
import { populateKeyMapForElement } from './keyed';
import { markReactivePropsDirtySource as _markReactivePropsDirtySource } from './dom';
import {
  configureRuntimeRenderer,
  getDefaultRuntime,
  type AskrRuntime,
  type RuntimeRendererHost,
} from '../runtime/runtime';

export function createRendererHost(): RuntimeRendererHost {
  return {
    evaluate: _evaluate,
    cleanupInstancesUnder,
    teardownNodeSubtree,
    populateKeyMapForElement,
    getKeyMapForElement,
    isKeyedReorderFastPathEligible,
    markReactivePropsDirtySource: _markReactivePropsDirtySource,
  };
}

export function installRendererBridge(
  runtime: AskrRuntime = getDefaultRuntime()
): true {
  configureRuntimeRenderer(createRendererHost(), runtime);
  return true;
}
