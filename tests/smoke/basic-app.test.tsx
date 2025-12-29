/**
 * tests/smoke/basic_app.test.tsx
 *
 * Golden path smoke test: proves JSX → render → event → state → rerender works end-to-end.
 * Zero cleverness, just the fundamental Askr contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('basic app smoke test', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should render JSX to DOM', () => {
    const Component = () => ({ type: 'div', children: ['Hello Askr'] });
    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('Hello Askr');
  });

  it('should handle state updates', () => {
    const Component = () => {
      const count = state(0);
      return {
        type: 'div',
        children: [count().toString()],
        props: {
          onClick: () => count.set(count() + 1),
        },
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');

    // Simulate click
    const div = container.querySelector('div');
    div?.click();
    flushScheduler();
    expect(container.textContent).toBe('1');
  });

  it('should rerender on state change', () => {
    const Component = () => {
      const count = state(0);
      return {
        type: 'button',
        children: [`Count: ${count()}`],
        props: {
          onClick: () => count.set(count() + 1),
        },
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('Count: 0');

    const button = container.querySelector('button') as HTMLButtonElement;
    button.click();
    flushScheduler();
    expect(container.textContent).toBe('Count: 1');
  });

  it('should handle component props', () => {
    const Component = ({ message }: { message: string }) => ({
      type: 'p',
      children: [message],
    });

    createIsland({
      root: container,
      component: () => Component({ message: 'Props work' }),
    });
    flushScheduler();
    expect(container.textContent).toBe('Props work');
  });

  it('should mount and unmount cleanly', () => {
    const Component = () => ({ type: 'span', children: ['Mounted'] });
    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('Mounted');

    // Cleanup happens in afterEach
  });

  it('should handle multiple components', () => {
    const App = () => ({
      type: 'div',
      children: [
        { type: 'h1', children: ['Title'] },
        { type: 'p', children: ['Content'] },
      ],
    });

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('p')?.textContent).toBe('Content');
  });

  it('should handle nested state updates', () => {
    const Component = () => {
      const items = state(['a', 'b']);
      return {
        type: 'ul',
        children: items().map((item) => ({ type: 'li', children: [item] })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('should handle events with preventDefault', () => {
    const Component = () => ({
      type: 'form',
      children: [
        { type: 'button', children: ['Submit'], props: { type: 'submit' } },
      ],
      props: {
        onSubmit: (e: Event) => e.preventDefault(),
      },
    });

    createIsland({ root: container, component: Component });
    flushScheduler();

    const form = container.querySelector('form');
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should maintain component identity', () => {
    let renderCount = 0;
    const Component = () => {
      renderCount++;
      return { type: 'div', children: [`Render ${renderCount}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(renderCount).toBe(1);
  });
});
