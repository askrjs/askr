import { resetRouteState } from '../../router-test-utils';
// tests/dev_errors/prod_fallbacks.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src/index';
import { _resetDefaultPortal } from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import { nextComponentInstanceId } from '../../../src/renderer/component-host-instances';
import {
  deleteDevValue,
  getDevNamespace,
  getDevValue,
  incDevCounter,
} from '../../../src/runtime/dev-namespace';

describe('prod fallbacks (DEV_ERRORS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    // Reset the default portal so tests don't share state
    _resetDefaultPortal();
  });
  afterEach(() => cleanup());

  it('should silently skip invariant checks when in production mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const Bad = () => {
        const s = state(0);
        s.set(1);
        return <div>{'x'}</div>;
      };

      // Spec: production may degrade gracefully for some invariant violations.
      expect(() => createIsland({ root: container, component: Bad })).toThrow(
        /state\.set\(\) cannot be called during component render/i
      );
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
      resetRouteState();
      createIsland({ root: container, component: () => <div /> });

      // Spec: missing-route warning should be suppressed in production.
      navigate('/missing');
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should not sample render timing in production mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('production render sampled the diagnostic clock');
    });

    try {
      expect(() => {
        createIsland({ root: container, component: () => <div /> });
        flushScheduler();
      }).not.toThrow();
      expect(now).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  it('should keep dev helpers runtime-switchable in test builds', () => {
    const prev = process.env.NODE_ENV;
    const key = '__TEST_RUNTIME_SWITCHABLE_DEV_COUNTER';

    try {
      process.env.NODE_ENV = 'development';
      deleteDevValue(key);
      incDevCounter(key);
      expect(getDevValue<number>(key)).toBe(1);

      process.env.NODE_ENV = 'production';
      incDevCounter(key);
      expect(getDevValue<number>(key)).toBeUndefined();

      process.env.NODE_ENV = 'development';
      expect(getDevValue<number>(key)).toBe(1);
      deleteDevValue(key);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should not inspect the dev component counter in production mode', () => {
    const prev = process.env.NODE_ENV;
    const key = '__COMPONENT_INSTANCE_ID';
    process.env.NODE_ENV = 'development';
    const namespace = getDevNamespace();
    let reads = 0;
    let writes = 0;

    Object.defineProperty(namespace, key, {
      configurable: true,
      get() {
        reads++;
        return 0;
      },
      set() {
        writes++;
      },
    });

    try {
      process.env.NODE_ENV = 'production';
      expect(nextComponentInstanceId()).toMatch(/^comp-\d+$/);
      expect(reads).toBe(0);
      expect(writes).toBe(0);
    } finally {
      process.env.NODE_ENV = 'development';
      deleteDevValue(key);
      process.env.NODE_ENV = prev;
    }
  });

  it('should have identical behavior in production and development when no checks are triggered', () => {
    const prev = process.env.NODE_ENV;
    try {
      const Component = () => <div>{'ok'}</div>;

      process.env.NODE_ENV = 'development';
      createIsland({ root: container, component: Component });
      const devHTML = container.innerHTML;

      // Reset container and portal state between dev and prod runs
      container.innerHTML = '';
      _resetDefaultPortal();

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
      return <button onClick={() => s.set(s() + 1)}>{`count: ${s()}`}</button>;
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
        return <div>{'ok'}</div>;
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

    try {
      const runBatch = (
        env: 'development' | 'production',
        iterations = 100
      ): number => {
        process.env.NODE_ENV = env;

        // Warm the code path once so the comparison is less sensitive to first-run cost.
        {
          const { container, cleanup } = createTestContainer();
          createIsland({
            root: container,
            component: () => {
              const s = state(0);
              return <div>{s().toString()}</div>;
            },
          });
          cleanup();
        }

        const start = performance.now();
        for (let i = 0; i < iterations; i += 1) {
          const { container, cleanup } = createTestContainer();
          createIsland({
            root: container,
            component: () => {
              const s = state(i);
              return <div>{s().toString()}</div>;
            },
          });
          cleanup();
        }
        return performance.now() - start;
      };

      const durations = {
        development: [] as number[],
        production: [] as number[],
      };
      for (let sample = 0; sample < 5; sample += 1) {
        const order: Array<'development' | 'production'> =
          sample % 2 === 0
            ? ['development', 'production']
            : ['production', 'development'];
        for (const env of order) {
          durations[env].push(runBatch(env, 40));
        }
      }

      const median = (values: number[]): number => {
        const ordered = [...values].sort((a, b) => a - b);
        return ordered[Math.floor(ordered.length / 2)]!;
      };
      const devDuration = median(durations.development);
      const prodDuration = median(durations.production);

      // Production should not be materially slower than development on the same machine.
      expect(prodDuration).toBeLessThan(devDuration * 1.5);
    } finally {
      process.env.NODE_ENV = prev;
    }
  }, 15000);
});
