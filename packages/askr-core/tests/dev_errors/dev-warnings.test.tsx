// tests/dev_errors/dev_warnings.test.ts
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('dev warnings (DEV_ERRORS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should warn given missing keys when rendering dynamic lists', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn given unused state variable when rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Component = () => {
      state(123);
      return <div>{'x'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Spec: unused state should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should warn given slow render when in dev mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Component = () => {
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy loop
      }
      return <div>{'slow'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Spec: slow render should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  it('should include component name in missing-keys warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    const calledWith = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(calledWith).toContain('Missing keys on dynamic lists in FancyList');
    warn.mockRestore();
  });
});
