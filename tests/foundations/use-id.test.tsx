import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useId } from '@askrjs/askr/foundations';
import { state } from '../../src/index';
import { createIsland } from '../helpers/create-island';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('useId (FOUNDATIONS)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const next = createTestContainer();
    container = next.container;
    cleanup = next.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should be stable across rerenders of same component instance', () => {
    const App = () => {
      const tick = state(0);
      const id = useId();

      return {
        type: 'button',
        props: {
          id,
          onClick: () => {
            tick.set(tick() + 1);
          },
        },
        children: [`tick=${tick()}`],
      };
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    const firstId = button.id;

    button.click();
    flushScheduler();

    const secondId = (container.querySelector('button') as HTMLButtonElement).id;
    expect(secondId).toBe(firstId);
  });

  it('should apply the provided prefix', () => {
    const App = () => {
      return {
        type: 'div',
        props: { id: useId({ prefix: 'x' }) },
      };
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const el = container.querySelector('div') as HTMLDivElement;
    expect(el.id.startsWith('x-')).toBe(true);
  });
});
