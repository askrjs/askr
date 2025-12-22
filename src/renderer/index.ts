// Renderer barrel entrypoint.
// Keep this file small: re-export the public surface and attach the
// runtime fast-lane bridge on import.

export * from './types';
export * from './cleanup';
export * from './keyed';
export * from './dom';
export { evaluate, clearDOMRange } from './evaluate';

import { evaluate as _evaluate } from './evaluate';
import { isKeyedReorderFastPathEligible, getKeyMapForElement } from './keyed';

// Expose minimal renderer bridge for runtime fast-lane to call `evaluate`
if (typeof globalThis !== 'undefined') {
  const _g = globalThis as Record<string, unknown>;
  _g.__ASKR_RENDERER = {
    evaluate: _evaluate,
    isKeyedReorderFastPathEligible,
    getKeyMapForElement,
  };
}
