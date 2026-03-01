/**
 * Event Handler Wrapper Cache Benchmark
 *
 * Measures the performance improvement from caching wrapped event handlers
 * instead of creating new wrappers for each render.
 *
 * Expected: Cached wrappers should show:
 * - Reduced allocation overhead on re-renders
 * - Better performance when handler references are stable
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../tests/helpers/test-renderer';
import { createIsland } from '../../src/boot';
import { state } from '../../src/runtime/state';

describe('framework::handler-cache::performance', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('stable handler reference (cache hit)', () => {
    bench('re-render with stable handler', () => {
      const count = state(0);
      const stableHandler = () => count.set(count() + 1);

      const Component = () => (
        <div>
          <button onClick={stableHandler}>count: {count()}</button>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Trigger multiple re-renders - handler should be cached
      for (let i = 0; i < 10; i++) {
        const btn = container.querySelector('button') as HTMLElement;
        fireEvent.click(btn);
        flushScheduler();
      }
    });
  });

  describe('new handler reference (cache miss)', () => {
    bench('re-render with new handler', () => {
      const count = state(0);

      const Component = () => (
        <div>
          <button onClick={() => count.set(count() + 1)}>
            count: {count()}
          </button>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Trigger multiple re-renders - new handler each time
      for (let i = 0; i < 10; i++) {
        const btn = container.querySelector('button') as HTMLElement;
        fireEvent.click(btn);
        flushScheduler();
      }
    });
  });

  describe('multiple elements with stable handlers', () => {
    bench('100 elements, stable handlers, 10 re-renders', () => {
      const count = state(0);
      const handlers = Array.from(
        { length: 100 },
        () => () => count.set(count() + 1)
      );

      const Component = () => (
        <div>
          {handlers.map((handler, i) => (
            <button key={i} onClick={handler}>
              Button {i}
            </button>
          ))}
          <div>count: {count()}</div>
        </div>
      );

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Trigger re-renders - should reuse cached wrappers
      for (let i = 0; i < 10; i++) {
        const btn = container.querySelector('button') as HTMLElement;
        fireEvent.click(btn);
        flushScheduler();
      }
    });
  });

  describe('handler replacement', () => {
    bench('replace handler on each render', () => {
      const count = state(0);
      const toggle = state(false);

      const Component = () => {
        const handler = toggle()
          ? () => count.set(count() + 2)
          : () => count.set(count() + 1);

        return (
          <div>
            <button id="btn" onClick={handler}>
              count: {count()}
            </button>
            <button id="toggle" onClick={() => toggle.set(!toggle())}>
              toggle
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // Alternate handlers - measure cache replacement overhead
      for (let i = 0; i < 10; i++) {
        const toggleBtn = container.querySelector(
          '#toggle'
        ) as HTMLButtonElement;
        fireEvent.click(toggleBtn);
        flushScheduler();

        const btn = container.querySelector('#btn') as HTMLButtonElement;
        fireEvent.click(btn);
        flushScheduler();
      }
    });
  });
});
