import { describe, expect, it } from 'vite-plus/test';
import { stream, type StreamResult } from '../../../src/resources';
import { state, type State } from '../../../src/runtime';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

class ControlledAsyncIterable<T> implements AsyncIterable<T> {
  returnCalls = 0;
  private waiting:
    | {
        resolve: (value: IteratorResult<T>) => void;
        reject: (reason: unknown) => void;
      }
    | undefined;
  private queued: Array<
    | { kind: 'value'; value: T }
    | { kind: 'done' }
    | { kind: 'error'; error: unknown }
  > = [];

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const queued = this.queued.shift();
        if (queued?.kind === 'value') {
          return Promise.resolve({ done: false, value: queued.value });
        }
        if (queued?.kind === 'done') {
          return Promise.resolve({ done: true, value: undefined });
        }
        if (queued?.kind === 'error') {
          return Promise.reject(queued.error);
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiting = { resolve, reject };
        });
      },
      return: () => {
        this.returnCalls += 1;
        this.waiting?.resolve({ done: true, value: undefined });
        this.waiting = undefined;
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }

  yield(value: T): void {
    if (this.waiting) {
      this.waiting.resolve({ done: false, value });
      this.waiting = undefined;
    } else {
      this.queued.push({ kind: 'value', value });
    }
  }

  complete(): void {
    if (this.waiting) {
      this.waiting.resolve({ done: true, value: undefined });
      this.waiting = undefined;
    } else {
      this.queued.push({ kind: 'done' });
    }
  }

  fail(error: unknown): void {
    if (this.waiting) {
      this.waiting.reject(error);
      this.waiting = undefined;
    } else {
      this.queued.push({ kind: 'error', error });
    }
  }
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('stream()', () => {
  it('should start after commit and expose one stable latest-value snapshot', async () => {
    const source = new ControlledAsyncIterable<number>();
    let calls = 0;
    let rendering = false;
    let sourceStartedDuringRender = false;
    const snapshots: StreamResult<number>[] = [];
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          rendering = true;
          const result = stream<number>(() => {
            calls += 1;
            sourceStartedDuringRender = rendering;
            return source;
          });
          rendering = false;
          snapshots.push(result);
          return (
            <p>{`${result.status}:${result.pending}:${result.value ?? 'none'}`}</p>
          );
        },
      });

      expect(container.textContent).toBe('connecting:true:none');
      flushScheduler();
      expect(calls).toBe(1);
      expect(sourceStartedDuringRender).toBe(false);

      source.yield(1);
      await settle();
      expect(container.textContent).toBe('connected:false:1');

      source.yield(2);
      await settle();
      expect(container.textContent).toBe('connected:false:2');
      expect(new Set(snapshots).size).toBe(1);

      source.complete();
      await settle();
      expect(snapshots.at(-1)).toMatchObject({
        value: 2,
        status: 'closed',
        pending: false,
        stale: true,
        error: null,
      });
    } finally {
      cleanup();
    }
  });

  it('should support promised sources and render initial data as stale', async () => {
    const source = new ControlledAsyncIterable<string>();
    let resolveSource!: (source: AsyncIterable<string>) => void;
    const promisedSource = new Promise<AsyncIterable<string>>((resolve) => {
      resolveSource = resolve;
    });
    let current: StreamResult<string> | undefined;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          current = stream(() => promisedSource, { initialValue: 'cached' });
          return <p>{`${current.status}:${current.stale}:${current.value}`}</p>;
        },
      });
      flushScheduler();
      expect(container.textContent).toBe('connecting:true:cached');
      expect(current?.pending).toBe(false);

      resolveSource(source);
      await settle();
      source.yield('live');
      await settle();
      expect(container.textContent).toBe('connected:false:live');
    } finally {
      cleanup();
    }
  });

  it('should treat an explicitly supplied null initial value as retained data', async () => {
    const source = new ControlledAsyncIterable<string | null>();
    let current: StreamResult<string | null> | undefined;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          current = stream(() => source, { initialValue: null });
          return (
            <p>{`${current.status}:${current.pending}:${current.stale}`}</p>
          );
        },
      });
      flushScheduler();

      expect(current).toMatchObject({
        status: 'connecting',
        pending: false,
        stale: true,
        value: null,
      });
      expect(container.textContent).toBe('connecting:false:true');
    } finally {
      cleanup();
    }
  });

  it('should retain values across failures, restart, and manual close', async () => {
    const sources = [
      new ControlledAsyncIterable<string>(),
      new ControlledAsyncIterable<string>(),
      new ControlledAsyncIterable<string>(),
    ];
    const signals: AbortSignal[] = [];
    let starts = 0;
    let current: StreamResult<string> | undefined;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          current = stream(({ signal }) => {
            signals.push(signal);
            return sources[starts++]!;
          });
          return <p>{`${current.status}:${current.stale}:${current.value}`}</p>;
        },
      });
      flushScheduler();

      sources[0]!.yield('one');
      await settle();
      sources[0]!.fail(new Error('offline'));
      await settle();
      expect(current).toMatchObject({
        value: 'one',
        status: 'error',
        pending: false,
        stale: true,
      });
      expect(current?.error?.message).toBe('offline');

      current?.restart();
      expect(current).toMatchObject({
        value: 'one',
        status: 'reconnecting',
        pending: false,
        stale: true,
        error: null,
      });
      expect(starts).toBe(2);

      sources[1]!.yield('two');
      await settle();
      current?.close();
      expect(signals[1]?.aborted).toBe(true);
      expect(sources[1]?.returnCalls).toBe(1);
      expect(current).toMatchObject({
        value: 'two',
        status: 'closed',
        pending: false,
        stale: true,
      });

      await settle();
      expect(starts).toBe(2);
      current?.restart();
      expect(starts).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('should restart active streams for dependency changes but not source identity', async () => {
    const first = new ControlledAsyncIterable<number>();
    const second = new ControlledAsyncIterable<number>();
    const replacement = new ControlledAsyncIterable<number>();
    const sources = [first, second];
    let sourceVersion!: State<number>;
    let dependency!: State<number>;
    let calls = 0;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          sourceVersion = state(0);
          dependency = state(0);
          const selected =
            sourceVersion() === 0 ? () => sources[calls++]! : () => replacement;
          const result = stream(selected, { deps: [dependency()] });
          return <p>{result.status}</p>;
        },
      });
      flushScheduler();
      await settle();
      expect(calls).toBe(1);

      sourceVersion.set(1);
      flushScheduler();
      expect(calls).toBe(1);
      expect(replacement.returnCalls).toBe(0);

      dependency.set(1);
      flushScheduler();
      await settle();
      expect(first.returnCalls).toBe(1);
      replacement.yield(2);
      await settle();
      expect(container.textContent).toBe('connected');
    } finally {
      cleanup();
    }
  });

  it('should abort and return an iterator exactly once while ignoring late work', async () => {
    const source = new ControlledAsyncIterable<string>();
    let signal: AbortSignal | undefined;
    let current: StreamResult<string> | undefined;
    const { container, cleanup } = createTestContainer();

    createIsland({
      root: container,
      component: () => {
        current = stream((context) => {
          signal = context.signal;
          return source;
        });
        return <p>{current.value ?? 'none'}</p>;
      },
    });
    flushScheduler();
    source.yield('live');
    await settle();
    expect(container.textContent).toBe('live');

    cleanup();
    expect(signal?.aborted).toBe(true);
    expect(source.returnCalls).toBe(1);

    source.yield('late');
    await settle();
    expect(source.returnCalls).toBe(1);
    expect(current?.value).toBe('live');
  });

  it('should never execute a source during synchronous SSR', () => {
    let calls = 0;

    const html = renderToStringSync(() => {
      const result = stream(
        async function* () {
          calls += 1;
          yield 'live';
        },
        { initialValue: 'cached' }
      );
      return <p>{`${result.status}:${result.stale}:${result.value}`}</p>;
    });

    expect(html).toContain('connecting:true:cached');
    expect(calls).toBe(0);
  });
});
