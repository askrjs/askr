/**
 * Namespace unload benchmark
 *
 * Measures cost of unloading routes belonging to a namespace (MFE unload).
 */

import { bench, describe } from 'vitest';
import {
  route,
  clearRoutes,
  unloadNamespace,
  getRoutes,
} from '../../src/index';

describe('route namespace unload', () => {
  bench('unload 200 route namespace (behavioral)', () => {
    clearRoutes();

    // Register many routes under a namespace
    for (let i = 0; i < 200; i++) {
      route(`/mfe/item/${i}`, () => ({ type: 'div' }), 'mfe-a');
    }

    // Sanity check: routes are registered
    const before = getRoutes().length;

    // Unload namespace (bench measures cost of this operation)
    unloadNamespace('mfe-a');

    const after = getRoutes().length;
    // Minimal sanity: ensure some routes were removed
    if (before === after) {
      throw new Error('unloadNamespace did not remove routes');
    }
  });
});
