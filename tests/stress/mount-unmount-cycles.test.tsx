// tests/stress/mount_unmount_cycles.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../helpers/test-renderer';

describe('mount unmount cycles (STRESS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should leave no state when mounted and unmounted 100 times', async () => {
    for (let i = 0; i < 100; i++) {
      const { container: local, cleanup: localCleanup } = createTestContainer();
      let counter: ReturnType<typeof state<number>> | null = null;
      const Component = () => {
        counter = state(0);
        return { type: 'div', children: [`${counter()}`] };
      };

      createIsland({ root: local, component: Component });
      flushScheduler();

      counter!.set(1);
      flushScheduler();
      expect(local.textContent).toBe('1');

      localCleanup();
    }

    const s = getSchedulerState();
    expect(s.running).toBe(false);
    expect(s.queueLength).toBe(0);
  });

  it('should survive when rapidly created and destroyed', async () => {
    let counter: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      counter = state(0);
      return {
        type: 'button',
        props: { id: 'btn', onClick: () => counter!.set(counter!() + 1) },
        children: [`${counter()}`],
      };
    };

    // Rapidly remount the same component (common in MFEs)
    for (let i = 0; i < 25; i++) {
      createIsland({ root: container, component: Component });
    }
    flushScheduler();

    const button = container.querySelector('#btn') as HTMLButtonElement;
    button.click();
    flushScheduler();

    expect(container.textContent).toBe('1');
  });

  it('should clean up listeners properly after mount/unmount cycles', async () => {
    let clicks = 0;

    const WithListener = () => ({
      type: 'button',
      props: { id: 'btn', onClick: () => (clicks += 1) },
      children: ['click'],
    });
    const WithoutListener = () => ({ type: 'div', children: ['gone'] });

    createIsland({ root: container, component: WithListener });
    flushScheduler();

    const oldButton = container.querySelector('#btn') as HTMLButtonElement;
    oldButton.click();
    expect(clicks).toBe(1);

    // Remove the button from the tree.
    createIsland({ root: container, component: WithoutListener });
    flushScheduler();
    expect(container.querySelector('#btn')).toBeNull();

    // Even if someone holds a reference, unmount should detach resources.
    oldButton.click();
    expect(clicks).toBe(1);
  });
});
