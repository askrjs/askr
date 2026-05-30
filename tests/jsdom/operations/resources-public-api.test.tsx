import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { capture, on, stream, task, timer } from '@askrjs/askr/resources';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resources public API', () => {
  it('should attach and clean up on() listeners from the public resources entrypoint', () => {
    const { container, cleanup } = createTestContainer();
    const target = new EventTarget();
    const handler = vi.fn();

    const App = () => {
      on(target, 'ping', handler);
      return <div data-testid="app">ready</div>;
    };

    createIsland({ root: container, component: App });

    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanupApp(container);

    target.dispatchEvent(new Event('ping'));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('should start and stop timer() intervals from the public resources entrypoint', () => {
    const { container, cleanup } = createTestContainer();
    const tick = vi.fn();

    const App = () => {
      timer(50, tick);
      return <div data-testid="app">ready</div>;
    };

    createIsland({ root: container, component: App });

    vi.advanceTimersByTime(160);
    expect(tick).toHaveBeenCalledTimes(3);

    cleanupApp(container);

    vi.advanceTimersByTime(200);
    expect(tick).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it('should run and clean up task() work from the public resources entrypoint', async () => {
    const { container, cleanup } = createTestContainer();
    const run = vi.fn();
    const dispose = vi.fn();

    const App = () => {
      task(() => {
        run();
        return dispose;
      });
      return <div data-testid="app">ready</div>;
    };

    createIsland({ root: container, component: App });

    expect(run).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();

    await Promise.resolve();
    await Promise.resolve();

    cleanupApp(container);

    expect(dispose).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('should keep capture() snapshots stable and expose the current stream() placeholder shape', () => {
    let value = 1;
    const snapshot = capture(() => value);
    value = 2;

    expect(snapshot()).toBe(1);
    expect(stream<string>('source')).toEqual({
      value: null,
      pending: true,
      error: null,
    });
  });
});
