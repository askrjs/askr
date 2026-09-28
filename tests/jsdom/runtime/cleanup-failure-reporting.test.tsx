import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import { task } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

// A cleanup failure outside renderer teardown (a late async mount cleanup) is
// reported through reportError after the current task, in every build, instead
// of a development-only or console-only log.
describe.each(['development', 'production'])(
  'cleanup failure reporting (%s)',
  (nodeEnv) => {
    let previousNodeEnv: string | undefined;
    let reportError: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
      await drainMicrotasks();
      process.env.NODE_ENV = previousNodeEnv;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('should report a late async mount cleanup failure', async () => {
      const error = new Error('late cleanup failed');
      const { container, cleanup } = createTestContainer();
      let resolveMount!: (cleanup: () => void) => void;
      const App = () => {
        task(
          () =>
            new Promise<() => void>((resolve) => {
              resolveMount = resolve;
            })
        );
        return <main />;
      };
      createIsland({ root: container, component: App });
      flushScheduler();

      try {
        cleanupApp(container);
        resolveMount(() => {
          throw error;
        });
        await drainMicrotasks();

        expect(reportError.mock.calls.map(([value]) => value)).toEqual([error]);
      } finally {
        cleanup();
      }
    });
  }
);
