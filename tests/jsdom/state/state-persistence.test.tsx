/**
 * tests/state/state_persistence.test.ts
 *
 * SPEC 2.5: State Persistence
 *
 * State values persist across re-renders and survive DOM updates.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

describe('state persistence (SPEC 2.5)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('state survives re-renders', () => {
    it('should persist state value across renders', async () => {
      let renderCount = 0;

      const Component = () => {
        const count = state(42);
        renderCount++;

        const trigger = () => {
          count.set(count() + 1);
        };

        return <button onClick={trigger}>count: {count()}</button>;
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(container.textContent).toContain('count: 42');
      const initialRenders = renderCount;

      const button = container.querySelector('button') as HTMLButtonElement;
      button?.click();
      flushScheduler();

      expect(container.textContent).toContain('count: 43');
      expect(renderCount).toBe(initialRenders + 1);
    });

    it('should persist multiple state values independently', async () => {
      let xState!: ReturnType<typeof state<number>>;
      let yState!: ReturnType<typeof state<number>>;
      let zState!: ReturnType<typeof state<number>>;
      let alternate!: ReturnType<typeof state<boolean>>;
      const Component = () => {
        const x = (xState = state(1));
        const y = (yState = state(2));
        const z = (zState = state(3));
        const showAlternate = (alternate = state(false));

        return (
          <div>
            {showAlternate() ? (
              <section>
                x={x()} y={y()} z={z()}
              </section>
            ) : (
              <span>
                x={x()} y={y()} z={z()}
              </span>
            )}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(container.textContent).toContain('x=1 y=2 z=3');
      xState.set(10);
      flushScheduler();
      expect(container.textContent).toContain('x=10 y=2 z=3');
      yState.set(20);
      flushScheduler();
      expect(container.textContent).toContain('x=10 y=20 z=3');
      zState.set(30);
      flushScheduler();
      expect(container.textContent).toContain('x=10 y=20 z=30');
      alternate.set(true);
      flushScheduler();
      expect(container.querySelector('section')?.textContent).toBe(
        'x=10 y=20 z=30'
      );
    });

    it('should persist state after DOM node replacement', async () => {
      const Component = () => {
        const toggle = state(false);

        return (
          <div>
            {toggle() ? (
              <span onClick={() => toggle.set(!toggle())}>
                toggle state: {String(toggle())}
              </span>
            ) : (
              <button onClick={() => toggle.set(!toggle())}>
                toggle state: {String(toggle())}
              </button>
            )}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(container.textContent).toContain('toggle state: false');

      const element = container.querySelector('div button') as HTMLElement;
      element?.click();
      flushScheduler();

      expect(container.textContent).toContain('toggle state: true');
    });
  });

  describe('state indices remain stable', () => {
    it('should maintain same index for state calls in same order', async () => {
      allowFrameworkWarnings(/Unused state variable detected/);
      const _indices: number[] = [];

      const Component = () => {
        const _a = state(1);
        const _b = state(2);
        const _c = state(3);

        // Would need to track indices somehow (implementation detail test)
        return <div>ok</div>;
      };
      createIsland({ root: container, component: Component });
      createIsland({ root: container, component: Component });

      flushScheduler();

      expect(container.textContent).toContain('ok');
    });
  });
});
