import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp } from '../../../src/boot';
import {
  createComponentInstance,
  registerMountOperation,
} from '../../../src/runtime';
import { ownComponentCleanup } from '../../../src/runtime/component/capabilities';
import {
  beginForStateTransaction,
  commitForStateTransaction,
  createForState,
} from '../../../src/runtime/control/for-state';
import {
  createItemInstance,
  disposeItemInstance,
} from '../../../src/runtime/control/for-scopes';
import { cleanupProvisionalComponentInstance } from '../../../src/renderer/component/host-replacement';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

// Cleanup failures outside renderer teardown (For item disposal, For
// settlement, provisional component rollback, late async mount cleanup) are
// reported through reportError after the current task, in every build, instead
// of a development-only or console-only log.
describe.each(['development', 'production'])(
  'cleanup failure reporting (%s)',
  (nodeEnv) => {
    let previousNodeEnv: string | undefined;
    let reportError: ReturnType<typeof vi.fn>;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
      await drainMicrotasks();
      process.env.NODE_ENV = previousNodeEnv;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function createFailingItem(error: Error) {
      const forState = createForState<number>(
        [1],
        (item) => item,
        () => null,
        null
      );
      const item = createItemInstance(1, 1, 0, forState);
      const dispose = item.scope.dispose.bind(item.scope);
      item.scope.dispose = () => {
        dispose();
        throw error;
      };
      return { forState, item };
    }

    it('should report a For item disposal failure outside a transaction', async () => {
      const error = new Error('item disposal failed');
      const { forState, item } = createFailingItem(error);

      expect(() => disposeItemInstance(forState, item, 'none')).not.toThrow();
      expect(reportError).not.toHaveBeenCalled();
      await drainMicrotasks();

      expect(reportError.mock.calls.map(([value]) => value)).toEqual([error]);
      expect(consoleError).not.toHaveBeenCalledWith(expect.any(String), error);
    });

    it('should report For removal cleanup failures during settlement', async () => {
      const error = new Error('removed scope disposal failed');
      const { forState, item } = createFailingItem(error);
      beginForStateTransaction(forState);
      const transaction = forState._transaction!;
      transaction.removedScopes = [item.scope];
      transaction.removedScopeNodes = [];

      expect(() =>
        commitForStateTransaction(forState, transaction)
      ).not.toThrow();
      await drainMicrotasks();

      expect(reportError.mock.calls.map(([value]) => value)).toEqual([error]);
    });

    it('should report a strict provisional component cleanup failure', async () => {
      const error = new Error('provisional cleanup failed');
      const instance = createComponentInstance(
        'provisional',
        () => null,
        {},
        null
      );
      instance.cleanupStrict = true;
      ownComponentCleanup(instance, () => {
        throw error;
      });

      expect(() => cleanupProvisionalComponentInstance(instance)).not.toThrow();
      await drainMicrotasks();

      expect(reportError).toHaveBeenCalledTimes(1);
      const reported = reportError.mock.calls[0]![0] as AggregateError;
      expect(reported).toBeInstanceOf(AggregateError);
      expect(reported.errors).toEqual([error]);
    });

    it('should report a late async mount cleanup failure', async () => {
      const error = new Error('late cleanup failed');
      const { container, cleanup } = createTestContainer();
      let resolveMount!: (cleanup: () => void) => void;
      const App = () => {
        registerMountOperation(
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
