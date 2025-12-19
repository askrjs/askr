// tests/identity/unmount_cleanup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  clearRoutes,
  createApp,
  navigate,
  route,
  state,
} from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('unmount cleanup (IDENTITY)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => {
    clearRoutes();
    cleanup();
  });

  it('should reset state when component unmounts', async () => {
    route('/a', () => {
      const count = state(0);
      return {
        type: 'button',
        props: { id: 'btn', onClick: () => count.set(count() + 1) },
        children: [`${count()}`],
      };
    });

    route('/b', () => ({ type: 'div', children: ['b'] }));

    window.history.pushState({}, '', '/a');
    createApp({ root: container, component: () => ({ type: 'div' }) });
    navigate('/a');
    flushScheduler();

    (container.querySelector('#btn') as HTMLButtonElement).click();
    flushScheduler();
    expect(container.textContent).toBe('1');

    navigate('/b');
    flushScheduler();
    expect(container.textContent).toBe('b');

    navigate('/a');
    flushScheduler();
    // Spec: navigation unmount resets state.
    expect(container.textContent).toBe('0');
  });

  it('should not leak state between instances', async () => {
    route('/a', () => {
      const count = state(0);
      return {
        type: 'button',
        props: { id: 'a', onClick: () => count.set(count() + 1) },
        children: [`a:${count()}`],
      };
    });

    route('/b', () => {
      const count = state(0);
      return {
        type: 'button',
        props: { id: 'b', onClick: () => count.set(count() + 1) },
        children: [`b:${count()}`],
      };
    });

    window.history.pushState({}, '', '/a');
    createApp({ root: container, component: () => ({ type: 'div' }) });

    navigate('/a');
    flushScheduler();
    (container.querySelector('#a') as HTMLButtonElement).click();
    flushScheduler();
    expect(container.textContent).toBe('a:1');

    navigate('/b');
    flushScheduler();
    expect(container.textContent).toBe('b:0');
  });
});
