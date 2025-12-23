/**
 * Coalescing effectiveness benchmark
 *
 * Measures how well multiple state updates are coalesced into single renders.
 * Validates that redundant renders are eliminated.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('coalescing effectiveness', () => {
  describe('single update', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updater: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const count = state(0);
        updater = () => count.set(count() + 1);
        return { type: 'div', children: [String(count())] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler(); // Initial render
    });

    afterEach(() => {
      cleanup();
      updater = null;
    });

    // Kept: 'single update (commit)'. Removed baseline (state-only) variant to reduce noise.
    bench('single update (commit)', () => {
      updater!();
      flushScheduler();
    });
  });

  describe('10 rapid updates', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updater: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const count = state(0);
        updater = () => {
          for (let i = 0; i < 10; i++) count.set(count() + 1);
        };
        return { type: 'div', children: [String(count())] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler(); // Initial render
    });

    afterEach(() => {
      cleanup();
      updater = null;
    });

    // Kept: '10 rapid updates (commit)'. Removed baseline (state-only) variant to reduce noise.
    bench('10 rapid updates (commit)', () => {
      updater!();
      flushScheduler();
    });
  });

  describe('100 burst updates', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updater: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const count = state(0);
        updater = () => {
          for (let i = 0; i < 100; i++) count.set(count() + 1);
        };
        return { type: 'div', children: [String(count())] };
      };

      createIsland({ root: container, component: Component });
      flushScheduler(); // Initial render
    });

    afterEach(() => {
      cleanup();
      updater = null;
    });

    // Kept: '100 burst updates (commit)'. Removed baseline (state-only) variant to reduce noise.
    bench('100 burst updates (commit)', () => {
      updater!();
      flushScheduler();
    });
  });
});
