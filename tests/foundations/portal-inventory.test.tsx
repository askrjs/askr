import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DefaultPortal,
  _resetDefaultPortal,
} from '../../src/foundations/structures/portal';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

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

  it('should drop writes before the host has mounted', () => {
    DefaultPortal.render({ children: 'Early' });
    flushScheduler();

    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['App'] }),
    });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should render written content after an explicit rerender', () => {
    const App = () => {
      const tick = state(0);
      return {
        type: 'button',
        props: {
          onClick: () => tick.set(tick() + 1),
        },
        children: [`tick=${tick()}`],
      };
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).not.toContain('Toast');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();
    expect(container.textContent).toContain('Toast');
  });
});
