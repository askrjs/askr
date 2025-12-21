// tests/dom/listener_lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('listener lifecycle (DOM)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should add event listener once when component mounts', async () => {
    let clicks = 0;
    let tick: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      tick = state(0);
      return {
        type: 'button',
        props: {
          id: 'btn',
          onClick: () => {
            clicks++;
          },
        },
        children: [`${tick()}`],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(clicks).toBe(1);

    // Re-render without changing handler should not duplicate listener.
    tick!.set(1);
    flushScheduler();
    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(clicks).toBe(2);
  });

  it('should remove listener when component unmounts', async () => {
    let clicks = 0;
    const With = () => ({
      type: 'button',
      props: { id: 'btn', onClick: () => (clicks += 1) },
      children: ['x'],
    });
    const Without = () => ({ type: 'div', children: ['gone'] });

    createIsland({ root: container, component: With });
    flushScheduler();
    const old = container.querySelector('#btn') as HTMLButtonElement;

    old.click();
    expect(clicks).toBe(1);

    createApp({ root: container, component: Without });
    flushScheduler();
    expect(container.querySelector('#btn')).toBeNull();

    // Spec: unmount disposes event resources.
    old.click();
    expect(clicks).toBe(1);
  });

  it('should replace listener when handler changes', async () => {
    let mode: ReturnType<typeof state<'a' | 'b'>> | null = null;
    let aClicks = 0;
    let bClicks = 0;

    const Component = () => {
      mode = state<'a' | 'b'>('a');
      return {
        type: 'button',
        props: {
          id: 'btn',
          onClick: () => {
            if (mode!() === 'a') aClicks++;
            else bClicks++;
          },
        },
        children: [mode()],
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(aClicks).toBe(1);
    expect(bClicks).toBe(0);

    mode!.set('b');
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(aClicks).toBe(1);
    expect(bClicks).toBe(1);
  });
});
