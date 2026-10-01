import { describe, expect, it } from 'vite-plus/test';
import { stream, type StreamResult } from '../../../src/resources';
import { state, type State } from '../../../src/index';
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
  it('should reject calls without a component owner', () => {
    let inputReads = 0;
    let starts = 0;

    expect(() =>
      stream(
        () => {
          inputReads += 1;
          return 'stream-id';
        },
        () => {
          starts += 1;
          return new ControlledAsyncIterable<string>();
        }
      )
    ).toThrow(
      '[Askr] stream() must be called during component render inside an app.'
    );
    expect(inputReads).toBe(0);
    expect(starts).toBe(0);

    expect(() =>
      stream(() => {
        starts += 1;
        return new ControlledAsyncIterable<string>();
      })
    ).toThrow(
      '[Askr] stream() must be called during component render inside an app.'
    );
    expect(starts).toBe(0);
  });

  it('should restart from a render source after commit and retire the prior iterator', async () => {
    const sources = {
      first: new ControlledAsyncIterable<string>(),
      second: new ControlledAsyncIterable<string>(),
    };
    const started: string[] = [];
    let currentId!: State<'first' | 'second'>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          currentId = state<'first' | 'second'>('first');
          const result = stream(currentId, (id, { signal }) => {
            expect(signal).toBeInstanceOf(AbortSignal);
            started.push(id);
            return sources[id];
          });
          return <p>{result.value ?? 'pending'}</p>;
        },
      });
      flushScheduler();
      expect(started).toEqual(['first']);
      sources.first.yield('one');
      await settle();
      expect(container.textContent).toBe('one');

      currentId.set('second');
      flushScheduler();
      expect(started).toEqual(['first', 'second']);
      expect(sources.first.returnCalls).toBe(1);
      sources.second.yield('two');
      await settle();
      expect(container.textContent).toBe('two');
    } finally {
      cleanup();
    }
  });

  it('should retain the committed stream when a source-changing render rolls back', async () => {
    const sources = new Map<string, ControlledAsyncIterable<string>>();
    const started: string[] = [];
    let setId!: (value: string) => void;
    let setFailure!: (value: boolean) => void;
    const Failure = ({ active }: { active: boolean }) => {
      if (active) throw new Error('render failed');
      return <span>{'ready'}</span>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          const id = state('first');
          const fail = state(false);
          setId = id.set;
          setFailure = fail.set;
          stream(id, (value) => {
            started.push(value);
            const source = new ControlledAsyncIterable<string>();
            sources.set(value, source);
            return source;
          });
          return <Failure active={fail()} />;
        },
      });
      flushScheduler();
      expect(started).toEqual(['first']);

      setId('second');
      setFailure(true);
      expect(() => flushScheduler()).toThrow();
      await settle();
      expect(started).toEqual(['first']);
      expect(sources.get('first')?.returnCalls).toBe(0);

      setFailure(false);
      setId('third');
      flushScheduler();
      expect(started).toEqual(['first', 'third']);
      expect(sources.get('first')?.returnCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

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
      expect(signals[0]?.aborted).toBe(true);
      expect(sources[0]?.returnCalls).toBe(1);

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
      expect(sources[0]?.returnCalls).toBe(1);
    } finally {
      cleanup();
    }
  });

  it.each(['throw', 'reject'] as const)(
    'should abort a source generation that fails by %s',
    async (failure) => {
      const error = new Error('connection failed');
      let signal: AbortSignal | undefined;
      let current: StreamResult<string> | undefined;
      const { container, cleanup } = createTestContainer();

      try {
        createIsland({
          root: container,
          component: () => {
            current = stream<string>((context) => {
              signal = context.signal;
              if (failure === 'throw') throw error;
              return Promise.reject(error);
            });
            return <p>{current.status}</p>;
          },
        });
        flushScheduler();
        await settle();

        expect(current).toMatchObject({
          status: 'error',
          pending: false,
          error,
        });
        expect(signal?.aborted).toBe(true);
      } finally {
        cleanup();
      }
    }
  );

  it.each(['restart', 'close'] as const)(
    'should preserve %s from an abort listener when an iterator fails',
    async (decision) => {
      const first = new ControlledAsyncIterable<string>();
      const second = new ControlledAsyncIterable<string>();
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
              return starts++ === 0 ? first : second;
            });
            return <p>{current.value ?? current.status}</p>;
          },
        });
        flushScheduler();
        await settle();
        signals[0]!.addEventListener('abort', () => current?.[decision](), {
          once: true,
        });
        first.fail(new Error('offline'));
        await settle();
        await settle();

        expect(signals[0]?.aborted).toBe(true);
        expect(first.returnCalls).toBe(1);
        expect(current?.error).toBe(null);
        if (decision === 'restart') {
          expect(starts).toBe(2);
          expect(signals[1]?.aborted).toBe(false);
          second.yield('recovered');
          await settle();
          expect(container.textContent).toBe('recovered');
        } else {
          expect(starts).toBe(1);
          expect(current?.status).toBe('closed');
        }
      } finally {
        cleanup();
      }
      expect(first.returnCalls).toBe(1);
    }
  );

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

  it.each(['completion', 'error'] as const)(
    'should reconnect after %s when committed source dependencies change',
    async (terminal) => {
      const sources = {
        first: new ControlledAsyncIterable<string>(),
        second: new ControlledAsyncIterable<string>(),
      };
      const started: string[] = [];
      let currentId!: State<'first' | 'second'>;
      const { container, cleanup } = createTestContainer();

      try {
        createIsland({
          root: container,
          component: () => {
            currentId = state<'first' | 'second'>('first');
            const result = stream(currentId, (id) => {
              started.push(id);
              return sources[id];
            });
            return <p>{result.status}</p>;
          },
        });
        flushScheduler();
        expect(started).toEqual(['first']);

        if (terminal === 'completion') sources.first.complete();
        else sources.first.fail(new Error('offline'));
        await settle();
        await settle();
        expect(container.textContent).toBe(
          terminal === 'completion' ? 'closed' : 'error'
        );

        currentId.set('second');
        flushScheduler();
        expect(started).toEqual(['first', 'second']);
        expect(container.textContent).toBe('connecting');
      } finally {
        cleanup();
      }
    }
  );

  it('should not reconnect a source change after explicit close until restart', async () => {
    const sources = {
      first: new ControlledAsyncIterable<string>(),
      second: new ControlledAsyncIterable<string>(),
    };
    const started: string[] = [];
    let currentId!: State<'first' | 'second'>;
    let current!: StreamResult<string>;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          currentId = state<'first' | 'second'>('first');
          current = stream(currentId, (id) => {
            started.push(id);
            return sources[id];
          });
          return <p>{current.status}</p>;
        },
      });
      flushScheduler();
      current.close();

      currentId.set('second');
      flushScheduler();
      expect(started).toEqual(['first']);
      expect(container.textContent).toBe('closed');

      current.restart();
      expect(started).toEqual(['first', 'second']);
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

  it('should close when an iterator return getter throws', async () => {
    const iterator: AsyncIterator<string> = {
      next: () => new Promise<IteratorResult<string>>(() => {}),
    };
    Object.defineProperty(iterator, 'return', {
      get() {
        throw new Error('return getter failed');
      },
    });
    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => iterator,
    };
    let current: StreamResult<string> | undefined;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          current = stream(() => source);
          return <p>{current.status}</p>;
        },
      });
      flushScheduler();
      await settle();

      expect(() => current?.close()).not.toThrow();
      expect(current).toMatchObject({
        status: 'closed',
        pending: false,
        error: null,
      });
    } finally {
      cleanup();
    }
  });

  it('should preserve lifecycle changes made by abort listeners', async () => {
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
          return <p>{current.value ?? 'none'}</p>;
        },
      });
      flushScheduler();
      await settle();

      signals[0]!.addEventListener('abort', () => current?.restart(), {
        once: true,
      });
      current?.restart();

      expect(starts).toBe(2);
      expect(sources[0]?.returnCalls).toBe(1);
      expect(signals[1]?.aborted).toBe(false);

      sources[1]!.yield('successor');
      await settle();
      expect(container.textContent).toBe('successor');

      signals[1]!.addEventListener('abort', () => current?.close(), {
        once: true,
      });
      current?.restart();

      expect(starts).toBe(2);
      expect(sources[1]?.returnCalls).toBe(1);
      expect(current).toMatchObject({
        status: 'closed',
        pending: false,
        error: null,
      });
    } finally {
      cleanup();
    }
  });

  it('should keep a restart made while close aborts the active generation', async () => {
    const sources = [
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
          return <p>{current.value ?? current.status}</p>;
        },
      });
      flushScheduler();
      await settle();

      signals[0]!.addEventListener('abort', () => current?.restart(), {
        once: true,
      });
      current?.close();

      expect(starts).toBe(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(sources[0]?.returnCalls).toBe(1);
      expect(current?.status).toBe('connecting');

      sources[1]!.yield('restarted');
      await settle();
      expect(current?.value).toBe('restarted');
      expect(container.textContent).toBe('restarted');

      current?.close();
      expect(signals[1]?.aborted).toBe(true);
      expect(sources[1]?.returnCalls).toBe(1);
      expect(current?.status).toBe('closed');
    } finally {
      cleanup();
    }
  });

  it('should preserve a restart made by iterator return()', async () => {
    const second = new ControlledAsyncIterable<string>();
    let returnCalls = 0;
    let starts = 0;
    let current: StreamResult<string> | undefined;
    const first: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<string>>(() => {}),
        return: () => {
          returnCalls += 1;
          current?.restart();
          return Promise.resolve({ done: true, value: undefined });
        },
      }),
    };
    const signals: AbortSignal[] = [];
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          current = stream(({ signal }) => {
            signals.push(signal);
            return starts++ === 0 ? first : second;
          });
          return <p>{current.value ?? 'none'}</p>;
        },
      });
      flushScheduler();
      await settle();

      current?.restart();

      expect(starts).toBe(2);
      expect(returnCalls).toBe(1);
      expect(signals[1]?.aborted).toBe(false);

      second.yield('successor');
      await settle();
      expect(container.textContent).toBe('successor');
    } finally {
      cleanup();
    }
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
