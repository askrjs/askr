import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createIsland,
  DefaultPortal,
  _resetDefaultPortal,
} from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

// Provide typing for dev-only global debug counters
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GlobalThis {
  __ASKR__?: {
    __PORTAL_WRITES?: number;
    __PORTAL_READS?: number;
    __PORTAL_HOST_ATTACHED?: boolean;
    __PORTAL_HOST_ID?: string;
  };
}

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
      component: () => ({ type: 'div', children: ['App'] }),
    });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should render content into the default portal and clear it', () => {
    createIsland({
      root: container,
      component: () => ({ type: 'div', children: ['App'] }),
    });
    flushScheduler();

    expect(typeof DefaultPortal.render).toBe('function');
    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    // Debug: ensure portal write happened
    expect(globalThis.__ASKR__?.__PORTAL_WRITES).toBeGreaterThan(0);
    expect(container.textContent).toContain('Toast');

    // Clear portal
    DefaultPortal.render({ children: undefined });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });
});
