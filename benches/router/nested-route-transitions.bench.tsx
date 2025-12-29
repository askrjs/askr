/**
 * Nested route transition benchmark
 *
 * Measures cost of moving between parent and child route handlers.
 */

import { bench, describe, beforeEach } from 'vitest';
import { createIsland } from '../../src';
import { route, clearRoutes, navigate } from '../../src/router';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('nested route transitions', () => {
  beforeEach(() => {
    clearRoutes();

    // Parent route (lists)
    route('/users', () => ({
      type: 'div',
      children: [
        { type: 'h1', children: ['Users'] },
        {
          type: 'div',
          children: Array.from({ length: 20 }, (_, i) => ({
            type: 'a',
            props: { href: `/users/${i}`, key: String(i) },
            children: [String(i)],
          })),
        },
      ],
    }));

    // Child route (user detail)
    route('/users/{id}', (params) => ({
      type: 'div',
      children: ['user:' + params.id],
    }));
  });

  // Kept: representative 'commit' behavioral benchmark. Removed baseline and transactional variants to reduce noise.
  bench('100 parent -> child -> sibling transitions (commit)', () => {
    const { container, cleanup } = createTestContainer();

    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['Users'] }),
    });
    flushScheduler();

    // Navigate sequences with single commit
    for (let i = 0; i < 100; i++) {
      navigate('/users/3');
      navigate('/users/4');
      navigate('/users');
    }
    flushScheduler();

    cleanup();
  });
});
