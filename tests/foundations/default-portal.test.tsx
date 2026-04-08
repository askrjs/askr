import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  DefaultPortal,
  _resetDefaultPortal,
} from '../../src/foundations/structures/portal';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('DefaultPortal', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Reset the default portal so tests don't share state
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
  });

  it('should be present by default and render nothing until used', () => {
    createIsland({
      root: container,
      component: () => <div>{'App'}</div>,
    });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should render content into the default portal and clear it', () => {
    const App = () => {
      const tick = state(0);
      return (
        <button onClick={() => tick.set(tick() + 1)}>{`tick=${tick()}`}</button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(typeof DefaultPortal.render).toBe('function');

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).not.toContain('Toast');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();
    expect(container.textContent).toContain('Toast');

    DefaultPortal.render({ children: undefined });
    flushScheduler();
    expect(container.textContent).toContain('Toast');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();
    expect(container.textContent).not.toContain('Toast');
  });
});
