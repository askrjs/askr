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
import { For } from '../../../src/control';
import {
  createComponentInstance,
  mountInstanceInline,
} from '../../../src/runtime';
import { _resetDefaultPortal } from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import { loadDocument } from '../../../src/router/document-navigation';
import { nextComponentInstanceId } from '../../../src/renderer/component/host-instances';
import {
  deleteDevValue,
  getDevNamespace,
  getDevValue,
  incDevCounter,
} from '../../../src/runtime/diagnostics/dev-namespace';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));
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
      expect(loadDocument).toHaveBeenCalledWith(
        `${window.location.origin}/missing`,
        'push'
      );

      warn.mockRestore();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should keep rejecting duplicate For keys in production mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const Component = () => (
        <For each={['left', 'right']} by={() => 'duplicate'}>
          {(item) => <span>{item}</span>}
        </For>
      );

      // Spec: duplicate keys would silently drop rows, so they fail in every build.
      expect(() =>
        createIsland({ root: container, component: Component })
      ).toThrow(/Duplicate For key detected: duplicate/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('should silently swallow component host bookkeeping failures in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const target = document.createElement('div');
    Object.defineProperty(target, '__ASKR_INSTANCES', {
      configurable: true,
      set() {
        throw new Error('host is read-only');
      },
    });
    const BrokenHost = () => null;
    const instance = createComponentInstance(
      'broken-host',
      BrokenHost,
      {},
      target
    );

    try {
      mountInstanceInline(instance, target);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  it('should sample render timing only in development mode', () => {
    const prev = process.env.NODE_ENV;
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    let renders = 0;
    const Component = () => {
      renders++;
      return <div />;
    };

    try {
      process.env.NODE_ENV = 'development';
      createIsland({ root: container, component: Component });
      flushScheduler();
      expect(renders).toBe(1);
      expect(now).toHaveBeenCalled();

      now.mockClear();
      process.env.NODE_ENV = 'production';
      createIsland({ root: container, component: Component });
      flushScheduler();
      expect(renders).toBe(2);
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
});
