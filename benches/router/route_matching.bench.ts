/**
 * Route matching benchmark
 *
 * Measures matching performance for various route patterns.
 */

import { bench, describe } from 'vitest';
import { route, clearRoutes } from '../../src/index';
import { resolveRoute } from '../../src/router/route';

describe('route matching', () => {
  // Collapsed per-pattern micro-variants into a single mixed-pattern bench to
  // summarize matching performance across common patterns.
  bench('100 route matches (mixed patterns)', () => {
    clearRoutes();
    const patterns = [
      { pat: '/about', url: '/about' },
      { pat: '/users/{id}', url: '/users/123' },
      { pat: '/files/*', url: '/files/path/to/resource' },
      { pat: '/*', url: '/any/arbitrary/path' },
    ];

    for (const p of patterns) route(p.pat, () => ({ type: 'div' }));

    for (let i = 0; i < 100; i++) {
      for (const p of patterns) resolveRoute(p.url);
    }
  });
});
