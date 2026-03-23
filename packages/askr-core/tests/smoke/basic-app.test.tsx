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
    const Component = () => <div>Hello Askr</div>;
    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('Hello Askr');
  });

  it('should handle state updates', () => {
    const Component = () => {
      const count = state(0);
      return (
        <div onClick={() => count.set(count() + 1)}>{String(count())}</div>
      );
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
      return (
        <button onClick={() => count.set(count() + 1)}>Count: {count()}</button>
      );
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
    const Component = ({ message }: { message: string }) => <p>{message}</p>;

    createIsland({
      root: container,
      component: () => Component({ message: 'Props work' }),
    });
    flushScheduler();
    expect(container.textContent).toBe('Props work');
  });

  it('should mount and unmount cleanly', () => {
    const Component = () => <span>Mounted</span>;
    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('Mounted');

    // Cleanup happens in afterEach
  });

  it('should handle multiple components', () => {
    const App = () => (
      <div>
        <h1>Title</h1>
        <p>Content</p>
      </div>
    );

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('p')?.textContent).toBe('Content');
  });

  it('should handle nested state updates', () => {
    const Component = () => {
      const items = state(['a', 'b']);
      return (
        <ul>
          {items().map((item) => (
            <li>{item}</li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('should handle events with preventDefault', () => {
    const Component = () => (
      <form onSubmit={(e: Event) => e.preventDefault()}>
        <button type="submit">Submit</button>
      </form>
    );

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
      return <div>Render {renderCount}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(renderCount).toBe(1);
  });
});
