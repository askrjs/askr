import { describe, expect, it } from 'vite-plus/test';
import {
  resource,
  stream,
  type ResourceResult,
  type StreamResult,
} from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
  await Promise.resolve();
  flushScheduler();
};

describe('snapshot field reactivity', () => {
  it('should let a child that reads a passed resource field update on its own', async () => {
    let parentRenders = 0;
    let valueRenders = 0;
    let errorRenders = 0;
    let finish!: (value: string) => void;

    const ValueView = (props: { snap: ResourceResult<string> }) => {
      valueRenders++;
      return (
        <b>{props.snap.pending ? 'loading' : (props.snap.value as string)}</b>
      );
    };
    const ErrorView = (props: { snap: ResourceResult<string> }) => {
      errorRenders++;
      return <i>{props.snap.error ? 'bad' : 'ok'}</i>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          parentRenders++;
          const snap = resource<string>(
            () =>
              new Promise<string>((resolve) => {
                finish = resolve;
              })
          );
          return (
            <div>
              <ValueView snap={snap} />
              <ErrorView snap={snap} />
            </div>
          );
        },
      });
      flushScheduler();
      await settle();
      expect(container.textContent).toBe('loadingok');
      const parent = parentRenders;
      const errors = errorRenders;
      finish('done');
      await settle();
      expect(container.textContent).toBe('doneok');
      // The parent never read the snapshot and the error reader's field did
      // not change, so neither re-rendered.
      expect(parentRenders).toBe(parent);
      expect(errorRenders).toBe(errors);
      expect(valueRenders).toBeGreaterThan(1);
    } finally {
      cleanup();
    }
  });

  it('should re-render a stream reader only when the field it read changes', async () => {
    let statusRenders = 0;
    let valueRenders = 0;
    let push!: (value: number) => void;
    const Status = (props: { snap: StreamResult<number> }) => {
      statusRenders++;
      return <b>{props.snap.status}</b>;
    };
    const Value = (props: { snap: StreamResult<number> }) => {
      valueRenders++;
      return <i>{String(props.snap.value)}</i>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          const snap = stream<number>(() => ({
            [Symbol.asyncIterator]() {
              const queue: number[] = [];
              let wake: (() => void) | undefined;
              push = (value) => {
                queue.push(value);
                wake?.();
              };
              return {
                async next() {
                  while (queue.length === 0) {
                    await new Promise<void>((resolve) => (wake = resolve));
                  }
                  return { done: false as const, value: queue.shift()! };
                },
              };
            },
          }));
          return (
            <div>
              <Status snap={snap} />
              <Value snap={snap} />
            </div>
          );
        },
      });
      flushScheduler();
      await settle();
      push(1);
      await settle();
      expect(container.textContent).toBe('connected1');
      const statuses = statusRenders;
      push(2);
      await settle();
      push(3);
      await settle();
      expect(container.textContent).toBe('connected3');
      expect(statusRenders).toBe(statuses);
      expect(valueRenders).toBeGreaterThan(2);
    } finally {
      cleanup();
    }
  });
});
