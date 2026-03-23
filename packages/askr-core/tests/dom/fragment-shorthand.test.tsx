import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland } from '../helpers/create-island';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('JSX fragment shorthand (<>...</>)', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should render multiple sibling elements without a wrapper', () => {
    const Component = () => (
      <>
        <div id="one">One</div>
        <div id="two">Two</div>
      </>
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(container.querySelector('#one')?.textContent).toBe('One');
    expect(container.querySelector('#two')?.textContent).toBe('Two');
    expect(container.children.length).toBe(2);
  });

  it('should render text nodes and element siblings together', () => {
    const Component = () => (
      <>
        Hello
        <span id="hi">Hi</span>
      </>
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Normalize whitespace because text nodes may include surrounding whitespace
    expect((container.textContent || '').replace(/\s+/g, '')).toBe('HelloHi');
    expect(container.querySelector('#hi')?.textContent).toBe('Hi');
  });
});
