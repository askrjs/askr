// Renderer barrel entrypoint.
// Keep this file small: re-export the public surface and attach the runtime
// fast-lane bridge on import.

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
import { isKeyedReorderFastPathEligible, getKeyMapForElement } from './keyed';
import { markReactivePropsDirtySource as _markReactivePropsDirtySource } from './dom';

export function installRendererBridge(): true {
  if (typeof globalThis !== 'undefined') {
    const _g = globalThis as Record<string, unknown>;
    _g.__ASKR_RENDERER = {
      evaluate: _evaluate,
      isKeyedReorderFastPathEligible,
      getKeyMapForElement,
      markReactivePropsDirtySource: _markReactivePropsDirtySource,
    };
  }
  return true;
}
