import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  DefaultPortal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('DefaultPortal inventory', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const r = createTestContainer();
    container = r.container;
    cleanup = r.cleanup;
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should expose a render method', () => {
    expect(typeof DefaultPortal.render).toBe('function');
  });

  it('should retain writes before the host has mounted', () => {
    DefaultPortal.render({ children: 'Early' });
    flushScheduler();

    createIsland({
      root: container,
      component: () => <div>{'App'}</div>,
    });
    flushScheduler();
    expect(container.textContent).toBe('AppEarly');
  });

  it('should render written content without requiring an explicit rerender', () => {
    const App = () => {
      const tick = state(0);
      return (
        <button onClick={() => tick.set(tick() + 1)}>{`tick=${tick()}`}</button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).toContain('Toast');
  });
});
