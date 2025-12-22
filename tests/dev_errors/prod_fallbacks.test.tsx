// tests/dev_errors/prod_fallbacks.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearRoutes, createIsland, navigate, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('prod fallbacks (DEV_ERRORS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should silently skip invariant checks when in production mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const Bad = () => {
        const s = state(0);
        s.set(1);
        return { type: 'div', children: ['x'] };
      };

      // Spec: production may degrade gracefully for some invariant violations.
      expect(() =>
        createIsland({ root: container, component: Bad })
      ).not.toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should disable dev warnings when in production mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Ensure no routes are registered and we have an active instance.
      clearRoutes();
      createIsland({ root: container, component: () => ({ type: 'div' }) });

      // Spec: missing-route warning should be suppressed in production.
      navigate('/missing');
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should have identical behavior in production and development when no checks are triggered', () => {
    const prev = process.env.NODE_ENV;
    try {
      const Component = () => ({ type: 'div', children: ['ok'] });

      process.env.NODE_ENV = 'development';
      createIsland({ root: container, component: Component });
      const devHTML = container.innerHTML;

      process.env.NODE_ENV = 'production';
      createIsland({ root: container, component: Component });
      const prodHTML = container.innerHTML;

      expect(devHTML).toBe(prodHTML);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should have identical behavior in production and development when no checks are triggered', () => {
    const prev = process.env.NODE_ENV;

    const Component = () => {
      const s = state(0);
      return {
        type: 'button',
        props: { onClick: () => s.set(s() + 1) },
        children: [`count: ${s()}`],
      };
    };

    try {
      process.env.NODE_ENV = 'development';
      const { container: devContainer, cleanup: devCleanup } =
        createTestContainer();
      createIsland({ root: devContainer, component: Component });
      flushScheduler();
      (devContainer.querySelector('button') as HTMLButtonElement).click();
      flushScheduler();

      process.env.NODE_ENV = 'production';
      const { container: prodContainer, cleanup: prodCleanup } =
        createTestContainer();
      createIsland({ root: prodContainer, component: Component });
      flushScheduler();
      (prodContainer.querySelector('button') as HTMLButtonElement).click();
      flushScheduler();

      expect(devContainer.textContent).toBe(prodContainer.textContent);

      devCleanup();
      prodCleanup();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should silently skip hook order enforcement in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const Bad = () => {
        if (Math.random() > 0.5) {
          state(1);
        }
        state(2);
        return { type: 'div', children: ['ok'] };
      };

      // Should not throw in prod
      expect(() =>
        createIsland({ root: container, component: Bad })
      ).not.toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should not impact performance with invariant checks in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        const Component = () => {
          const s = state(i);
          return { type: 'div', children: [s().toString()] };
        };
        const { cleanup } = createTestContainer();
        createIsland({
          root: document.createElement('div'),
          component: Component,
        });
        cleanup();
      }

      const end = performance.now();
      const duration = end - start;

      // Should be fast, no significant overhead
      expect(duration).toBeLessThan(1000); // arbitrary threshold
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
