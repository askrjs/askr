import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { For } from '../../../src/control';
import { definePortal } from '../../../src/runtime/portal/portal';
import type { ComponentInstance } from '../../../src/runtime/component/instance';
import { getSignal, resource, task } from '../../../src/resources';
import {
  elementListeners,
  elementReactivePropsCleanup,
  elementRefs,
} from '../../../src/renderer/ownership/cleanup';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Row = {
  id: number;
  kind: 'old' | 'new';
};

function collectErrorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [String(error)];
  }

  const messages = [error.message];
  if (error instanceof AggregateError) {
    for (const nestedError of error.errors) {
      messages.push(...collectErrorMessages(nestedError));
    }
  }
  return messages;
}

describe('component host cleanup failure isolation', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should commit replacement DOM and attempt every stale cleanup exactly once', async () => {
    let rows!: State<Row[]>;
    let ownerAborts = 0;
    let resourceAborts = 0;
    let ownerFailingCleanups = 0;
    let ownerSuccessfulCleanups = 0;
    let nestedAborts = 0;
    let nestedFailingCleanups = 0;
    let nestedCleanups = 0;
    let rootRefDetaches = 0;
    let nestedRefDetaches = 0;
    let newRefAttaches = 0;
    const listenerAttempts: string[] = [];
    const reactiveCleanupAttempts: string[] = [];

    const loader = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>(() => {
          signal.addEventListener('abort', () => {
            resourceAborts += 1;
          });
        })
    );

    function NestedOwner() {
      const signal = getSignal();
      signal.addEventListener('abort', () => {
        nestedAborts += 1;
      });
      task(() => () => {
        nestedFailingCleanups += 1;
        throw new Error('nested owner cleanup failed');
      });
      task(() => () => {
        nestedCleanups += 1;
      });

      return (
        <span
          data-nested={'old'}
          ref={(element) => {
            if (!element) {
              nestedRefDetaches += 1;
              throw new Error('nested ref cleanup failed');
            }
          }}
        >
          {'nested'}
        </span>
      );
    }

    function OldOwner() {
      const signal = getSignal();
      signal.addEventListener('abort', () => {
        ownerAborts += 1;
      });
      resource(loader, []);
      task(() => () => {
        ownerFailingCleanups += 1;
        throw new Error('owner cleanup failed');
      });
      task(() => () => {
        ownerSuccessfulCleanups += 1;
      });

      return (
        <section
          data-owner={'old'}
          ref={(element) => {
            if (!element) {
              rootRefDetaches += 1;
              throw new Error('root ref cleanup failed');
            }
          }}
        >
          <NestedOwner />
        </section>
      );
    }

    function NewOwner() {
      return (
        <article
          data-owner={'new'}
          ref={(element) => {
            if (element) {
              newRefAttaches += 1;
            }
          }}
        >
          {'new'}
        </article>
      );
    }

    function App() {
      rows = state<Row[]>([{ id: 1, kind: 'old' }]);
      return (
        <main>
          <For each={rows} by={(row) => row.id}>
            {(row) => (row.kind === 'old' ? <OldOwner /> : <NewOwner />)}
          </For>
        </main>
      );
    }

    createIsland({ root: container, component: App, cleanupStrict: true });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const oldRoot = container.querySelector(
      '[data-owner="old"]'
    ) as HTMLElement;
    for (const host of [
      oldRoot,
      ...Array.from(oldRoot.querySelectorAll('*')),
    ]) {
      const instances = (
        host as Element & {
          __ASKR_INSTANCE?: { cleanupStrict: boolean };
          __ASKR_INSTANCES?: Array<{ cleanupStrict: boolean }>;
        }
      ).__ASKR_INSTANCES;
      for (const instance of instances ?? []) {
        instance.cleanupStrict = true;
      }
      const primary = (
        host as Element & {
          __ASKR_INSTANCE?: { cleanupStrict: boolean };
        }
      ).__ASKR_INSTANCE;
      if (primary) {
        primary.cleanupStrict = true;
      }
    }
    const successfulListener = vi.fn();
    const failingListener = vi.fn();
    oldRoot.addEventListener('askr-failing', failingListener);
    oldRoot.addEventListener('askr-successful', successfulListener);
    elementListeners.set(
      oldRoot,
      new Map([
        [
          'askr-failing',
          {
            handler: failingListener,
            original: failingListener,
            eventName: 'askr-failing',
          },
        ],
        [
          'askr-successful',
          {
            handler: successfulListener,
            original: successfulListener,
            eventName: 'askr-successful',
          },
        ],
      ])
    );
    elementReactivePropsCleanup.set(
      oldRoot,
      new Map([
        [
          'failing',
          {
            fnRef: null,
            cleanup: () => {
              reactiveCleanupAttempts.push('failing');
              throw new Error('reactive cleanup failed');
            },
          },
        ],
        [
          'successful',
          {
            fnRef: null,
            cleanup: () => {
              reactiveCleanupAttempts.push('successful');
            },
          },
        ],
      ])
    );

    const originalRemoveEventListener =
      oldRoot.removeEventListener.bind(oldRoot);
    const removeListenerSpy = vi
      .spyOn(oldRoot, 'removeEventListener')
      .mockImplementation((eventName, listener, options) => {
        listenerAttempts.push(eventName);
        if (eventName === 'askr-failing') {
          throw new Error('listener cleanup failed');
        }
        originalRemoveEventListener(eventName, listener, options);
      });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    rows.set([{ id: 1, kind: 'new' }]);
    expect(() => flushScheduler()).not.toThrow();

    removeListenerSpy.mockRestore();

    const replacement = container.querySelector('[data-owner="new"]');
    expect(replacement?.tagName).toBe('ARTICLE');
    expect(container.querySelector('[data-owner="old"]')).toBeNull();
    expect(newRefAttaches).toBe(1);
    expect(listenerAttempts).toEqual(['askr-failing', 'askr-successful']);
    expect(reactiveCleanupAttempts).toEqual(['failing', 'successful']);
    expect(rootRefDetaches).toBe(1);
    expect(nestedRefDetaches).toBe(1);
    expect(ownerFailingCleanups).toBe(1);
    expect(ownerSuccessfulCleanups).toBe(1);
    expect(nestedFailingCleanups).toBe(1);
    expect(nestedCleanups).toBe(1);
    expect(ownerAborts).toBe(1);
    expect(resourceAborts).toBe(1);
    expect(nestedAborts).toBe(1);
    expect(elementListeners.has(oldRoot)).toBe(false);
    expect(elementReactivePropsCleanup.has(oldRoot)).toBe(false);
    expect(elementRefs.has(oldRoot)).toBe(false);
    expect(
      (oldRoot as HTMLElement & { __ASKR_INSTANCE?: unknown }).__ASKR_INSTANCE
    ).toBeUndefined();

    oldRoot.dispatchEvent(new Event('askr-successful'));
    expect(successfulListener).not.toHaveBeenCalled();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const reportedMessages = collectErrorMessages(errorSpy.mock.calls[0]?.[1]);
    expect(reportedMessages).toEqual(
      expect.arrayContaining([
        'listener cleanup failed',
        'reactive cleanup failed',
        'root ref cleanup failed',
        'nested ref cleanup failed',
        'owner cleanup failed',
        'nested owner cleanup failed',
      ])
    );

    rows.set([{ id: 1, kind: 'new' }]);
    flushScheduler();
    expect(rootRefDetaches).toBe(1);
    expect(nestedRefDetaches).toBe(1);
    expect(ownerFailingCleanups).toBe(1);
    expect(ownerSuccessfulCleanups).toBe(1);
    expect(nestedFailingCleanups).toBe(1);
    expect(nestedCleanups).toBe(1);
    expect(ownerAborts).toBe(1);
    expect(resourceAborts).toBe(1);
    expect(nestedAborts).toBe(1);

    errorSpy.mockRestore();
  });

  it('should dispose a nested null portal host during element host replacement', () => {
    type CommentHost = Comment & {
      __ASKR_INSTANCE?: ComponentInstance;
      __ASKR_INSTANCES?: ComponentInstance[];
    };

    const OverlayPortal = definePortal();
    let rows!: State<Row[]>;
    let portalCleanups = 0;

    function OldOwner() {
      return (
        <section data-owner={'old'}>
          <OverlayPortal />
        </section>
      );
    }

    function NewOwner() {
      return <article data-owner={'new'}>{'new'}</article>;
    }

    function App() {
      rows = state<Row[]>([{ id: 1, kind: 'old' }]);
      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => (row.kind === 'old' ? <OldOwner /> : <NewOwner />)}
        </For>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const oldRoot = container.querySelector('[data-owner="old"]')!;
    const walker = document.createTreeWalker(oldRoot, 128);
    const commentHosts: CommentHost[] = [];
    let current = walker.nextNode();
    while (current) {
      const host = current as CommentHost;
      if (host.__ASKR_INSTANCE || host.__ASKR_INSTANCES) {
        commentHosts.push(host);
      }
      current = walker.nextNode();
    }

    const portalHost = commentHosts.find((host) =>
      [host.__ASKR_INSTANCE, ...(host.__ASKR_INSTANCES ?? [])].some(
        (instance) => instance?.fn === OverlayPortal
      )
    );
    const portalInstance = [
      portalHost?.__ASKR_INSTANCE,
      ...(portalHost?.__ASKR_INSTANCES ?? []),
    ].find((instance) => instance?.fn === OverlayPortal)!;
    expect(portalHost).toBeDefined();
    expect(portalInstance.owner.mounted).toBe(true);
    (portalInstance.owner.cleanups ??= []).push(() => {
      portalCleanups += 1;
    });

    rows.set([{ id: 1, kind: 'new' }]);
    flushScheduler();

    expect(container.querySelector('[data-owner="new"]')).not.toBeNull();
    expect(portalHost?.__ASKR_INSTANCE).toBeUndefined();
    expect(portalHost?.__ASKR_INSTANCES).toBeUndefined();
    expect(portalInstance.owner.mounted).toBe(false);
    expect(portalCleanups).toBe(1);

    const disposedGeneration = portalInstance.evaluationGeneration;
    OverlayPortal.render({ children: <strong>{'stale'}</strong> });
    flushScheduler();
    expect(portalInstance.evaluationGeneration).toBe(disposedGeneration);

    rows.set([{ id: 1, kind: 'new' }]);
    flushScheduler();
    expect(portalCleanups).toBe(1);
  });
});
