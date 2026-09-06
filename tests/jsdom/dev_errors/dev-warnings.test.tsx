// tests/dev_errors/dev_warnings.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { configureRenderDiagnostics, state } from '../../../src/index';
import { For } from '../../../src/control';
import { getDevValue } from '../../../src/runtime/diagnostics/dev-namespace';
import {
  createComponentInstance,
  mountInstanceInline,
} from '../../../src/runtime';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  allowFrameworkWarnings,
  getCapturedFrameworkWarnings,
} from '../../setup-env';

describe('dev warnings (DEV_ERRORS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should warn given missing keys when rendering dynamic lists', async () => {
    allowFrameworkWarnings(/Missing keys on dynamic lists/);
    let items: ReturnType<typeof state<string[]>> | null = null;
    const Component = () => {
      items = state(['a', 'b', 'c']);
      return (
        <div>
          {items().map((x) => (
            <div>{x}</div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Spec: missing keys on dynamic lists should warn in dev.
    expect(getCapturedFrameworkWarnings().join('\n')).toContain(
      'Missing keys on dynamic lists'
    );
  });

  it('should warn when component host bookkeeping fails', () => {
    allowFrameworkWarnings(/Failed to record DOM ownership for BrokenHost/);
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

    mountInstanceInline(instance, target);

    const warning = getCapturedFrameworkWarnings().join('\n');
    expect(warning).toContain(
      'Failed to record DOM ownership for BrokenHost on <div>'
    );
    expect(warning).toContain('host is read-only');
  });

  it('should warn given unused state variable when rendering', async () => {
    allowFrameworkWarnings(/\[askr\] Unused state variable detected/);
    const Component = () => {
      state(123);
      return <div>{'x'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    cleanup();
    cleanup = () => {};

    // A runtime detector can prove lifetime-wide non-use only at unmount.
    expect(getCapturedFrameworkWarnings().join('\n')).toContain(
      '[askr] Unused state variable detected'
    );
  });

  it('should warn given slow render when in dev mode', async () => {
    allowFrameworkWarnings(/\[askr\] Slow render detected/);
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValue(110);
    const Component = () => <div>{'slow'}</div>;

    try {
      createIsland({ root: container, component: Component });
      flushScheduler();

      // Spec: slow render diagnostics sample the clock and warn in dev.
      expect(now).toHaveBeenCalled();
      expect(getCapturedFrameworkWarnings().join('\n')).toContain(
        '[askr] Slow render detected'
      );
    } finally {
      now.mockRestore();
    }
  });

  it('should honor a configured slow-render threshold', () => {
    const restore = configureRenderDiagnostics({
      slowRenderThresholdMs: 20,
    });
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValue(110);

    try {
      createIsland({
        root: container,
        component: () => <div>{'below configured threshold'}</div>,
      });
      flushScheduler();

      expect(now).toHaveBeenCalled();
      expect(getCapturedFrameworkWarnings().join('\n')).not.toContain(
        '[askr] Slow render detected'
      );
    } finally {
      now.mockRestore();
      restore();
    }
  });

  it('should suppress slow-render output without disabling diagnostics', () => {
    const before = getDevValue<number>('componentRuns') ?? 0;
    const restore = configureRenderDiagnostics({
      slowRenderThresholdMs: 0,
      slowRenderWarnings: false,
    });
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValue(110);

    try {
      createIsland({
        root: container,
        component: () => <div>{'quiet diagnostics'}</div>,
      });
      flushScheduler();

      expect(now).toHaveBeenCalled();
      expect(getDevValue<number>('componentRuns')).toBeGreaterThan(before);
      expect(getCapturedFrameworkWarnings().join('\n')).not.toContain(
        '[askr] Slow render detected'
      );
    } finally {
      now.mockRestore();
      restore();
    }
  });

  it('should not warn when children are keyed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let items: ReturnType<typeof state<string[]>> | null = null;
    const Component = () => {
      items = state(['a', 'b', 'c']);
      return (
        <ul>
          {items().map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Should NOT emit the missing-keys warning when keys present
    const containsMissingKeys = warn.mock.calls.some((c) =>
      String(c[0]).includes('Missing keys on dynamic lists')
    );
    expect(containsMissingKeys).toBe(false);
    warn.mockRestore();
  });

  it('should not warn given one renderable child and an empty conditional slot', () => {
    const Component = () => <div>{[<span>only</span>, null]}</div>;

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(getCapturedFrameworkWarnings().join('\n')).not.toContain(
      'Missing keys on dynamic lists'
    );
  });

  it('should include component name in missing-keys warning', async () => {
    allowFrameworkWarnings(/Missing keys on dynamic lists in FancyList/);
    let items: ReturnType<typeof state<string[]>> | null = null;
    const FancyList = () => {
      items = state(['a', 'b']);
      return (
        <div>
          {items().map((x) => (
            <div>{x}</div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: FancyList });
    flushScheduler();

    // Verify the warning message contains the component name
    const calledWith = getCapturedFrameworkWarnings().join('\n');
    expect(calledWith).toContain('Missing keys on dynamic lists in FancyList');
  });

  it('should throw when For receives null keys', async () => {
    let items: ReturnType<typeof state<string[]>> | null = null;

    const Component = () => {
      items = state(['a', 'b']);
      return (
        <div>
          {
            <For
              each={() => items!()}
              by={() => null as unknown as string | number}
            >
              {(item) => <span>{item}</span>}
            </For>
          }
        </div>
      );
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).toThrow(/Invalid For key detected/);
  });

  it('should throw when For receives duplicate keys', async () => {
    let items: ReturnType<typeof state<string[]>> | null = null;

    const Component = () => {
      items = state(['left', 'right']);
      return (
        <div>
          {
            <For each={() => items!()} by={() => 'dup'}>
              {(item) => <span>{item}</span>}
            </For>
          }
        </div>
      );
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).toThrow(/Duplicate For key detected: dup/);
  });
});
