import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  disposeDataRuntime,
  invalidate,
} from '../../../src/data';
import {
  createRouteRegistry,
  group,
  resolveRouteRequest,
  route,
} from '../../../src/router';
import {
  getRouteLayoutData,
  getRouteRenderData,
  getRouteRevalidation,
} from '../../../src/router/resolution';
import type { RouteRenderResult } from '../../../src/common/router';
import { findRouteLoaderEntries } from '../../../src/data/data-runtime';
import {
  loadThroughCache,
  ROUTE_LOADER_CACHE_LIMIT,
} from '../../../src/router/route-loader-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function render(result: unknown): RouteRenderResult {
  const value = result as RouteRenderResult;
  if (value?.kind !== 'render') throw new Error('expected a render result');
  return value;
}

describe('route loader cache', () => {
  const runtimes: Array<ReturnType<typeof createDataRuntime>> = [];
  const runtime = () => {
    const created = createDataRuntime();
    runtimes.push(created);
    return created;
  };

  afterEach(() => {
    vi.useRealTimers();
    for (const created of runtimes.splice(0)) disposeDataRuntime(created);
  });

  it('should restore the route loader cache bound as in-flight entries settle', async () => {
    const dataRuntime = runtime();
    const entries = findRouteLoaderEntries(dataRuntime)!;
    const controllers: AbortController[] = [];
    const resolvers: Array<(value: number) => void> = [];
    const requests: Array<Promise<unknown>> = [];

    for (let index = 0; index <= ROUTE_LOADER_CACHE_LIMIT; index += 1) {
      const controller = new AbortController();
      controllers.push(controller);
      requests.push(
        loadThroughCache(
          dataRuntime,
          `route-${index}`,
          () =>
            new Promise<number>((resolve) => {
              resolvers.push(resolve);
            }),
          { signal: controller.signal, staleTimeMs: 'always' }
        ).value as Promise<unknown>
      );
    }

    expect(entries.size).toBe(ROUTE_LOADER_CACHE_LIMIT + 1);
    expect(entries.has(`route-${ROUTE_LOADER_CACHE_LIMIT}`)).toBe(true);
    resolvers[0]!(0);
    await requests[0];

    expect(entries.size).toBeLessThanOrEqual(ROUTE_LOADER_CACHE_LIMIT);
    for (const controller of controllers) controller.abort();
  });

  it('should share a new request when the route cache is full of in-flight entries', async () => {
    const dataRuntime = runtime();
    const controllers: AbortController[] = [];
    const started: Array<ReturnType<typeof deferred<number>>> = [];
    const load = (key: string) => {
      const controller = new AbortController();
      const request = deferred<number>();
      controllers.push(controller);
      return loadThroughCache(
        dataRuntime,
        key,
        () => {
          started.push(request);
          return request.promise;
        },
        { signal: controller.signal, staleTimeMs: 'always' }
      );
    };

    for (let index = 0; index < ROUTE_LOADER_CACHE_LIMIT; index += 1) {
      load(`in-flight-${index}`);
    }

    const first = load('new-key');
    const second = load('new-key');

    expect(started).toHaveLength(ROUTE_LOADER_CACHE_LIMIT + 1);
    expect(first.value).toBe(second.value);

    started.forEach((request, index) => request.resolve(index));
    await Promise.all(started.map((request) => request.promise));
    for (const controller of controllers) controller.abort();
  });

  it('should publish the in-flight entry before invoking a reentrant loader', async () => {
    const dataRuntime = runtime();
    const controller = new AbortController();
    let starts = 0;
    let nested: ReturnType<typeof loadThroughCache> | undefined;
    const first = loadThroughCache(
      dataRuntime,
      'reentrant',
      () => {
        starts += 1;
        nested = loadThroughCache(
          dataRuntime,
          'reentrant',
          () => {
            starts += 1;
            return Promise.resolve('duplicate');
          },
          { signal: controller.signal, staleTimeMs: 'always' }
        );
        return Promise.resolve('shared');
      },
      { signal: controller.signal, staleTimeMs: 'always' }
    );

    expect(starts).toBe(1);
    expect(nested?.value).toBe(first.value);
    await expect(first.value).resolves.toBe('shared');
    controller.abort();
  });

  it('should render cached data immediately and revalidate in the background on a repeat visit', async () => {
    let version = 0;
    const loader = vi.fn(async () => `v${(version += 1)}`);
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };

    const first = render(await resolveRouteRequest('/p', options));
    expect(getRouteRenderData(first)).toBe('v1');
    expect(getRouteRevalidation(first)).toBeUndefined();

    const second = resolveRouteRequest('/p', options);
    // Not a promise: the cached value renders without waiting.
    expect(second).not.toBeInstanceOf(Promise);
    expect(getRouteRenderData(render(second))).toBe('v1');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(await getRouteRevalidation(render(second))).toEqual(['v2']);

    const third = resolveRouteRequest('/p', options);
    expect(getRouteRenderData(render(third))).toBe('v2');
  });

  it('should share one request between concurrent navigations to the same key', async () => {
    const pending = deferred<string>();
    const loader = vi.fn(() => pending.promise);
    const registry = createRouteRegistry(() => {
      route('/p/{id}', () => null, { loader });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };

    const a = resolveRouteRequest('/p/1', options);
    const b = resolveRouteRequest('/p/1', options);
    const other = resolveRouteRequest('/p/2', options);
    expect(loader).toHaveBeenCalledTimes(2);
    pending.resolve('data');
    expect(getRouteRenderData(render(await a))).toBe('data');
    expect(getRouteRenderData(render(await b))).toBe('data');
    await other;
  });

  it('should key entries by params and search', async () => {
    const loader = vi.fn(async ({ search }: { search: string }) => search);
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };

    await resolveRouteRequest('/p?a=1', options);
    await resolveRouteRequest('/p?a=2', options);
    expect(loader).toHaveBeenCalledTimes(2);
    const hit = render(resolveRouteRequest('/p?a=1', options));
    expect(getRouteRenderData(hit)).toBe('?a=1');
  });

  it('should not revalidate data younger than staleTimeMs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const loader = vi.fn(async () => 'data');
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader, staleTimeMs: 5_000 });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };

    await resolveRouteRequest('/p', options);
    vi.setSystemTime(3_000);
    const fresh = render(resolveRouteRequest('/p', options));
    expect(getRouteRevalidation(fresh)).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);

    vi.setSystemTime(7_000);
    const stale = render(resolveRouteRequest('/p', options));
    expect(getRouteRevalidation(stale)).toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should revalidate on every visit when staleTimeMs is always', async () => {
    const loader = vi.fn(async () => 'data');
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader, staleTimeMs: 'always' });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };
    await resolveRouteRequest('/p', options);
    const hit = render(resolveRouteRequest('/p', options));
    expect(getRouteRevalidation(hit)).toBeDefined();
  });

  it('should drop an entry when its key prefix is invalidated', async () => {
    let version = 0;
    const loader = vi.fn(async () => `v${(version += 1)}`);
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
      route('/q', () => null, { loader: async () => 'q' });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };
    await resolveRouteRequest('/p', options);
    await resolveRouteRequest('/q', options);

    invalidate('route-data:/p', { runtime: dataRuntime });

    const reloaded = resolveRouteRequest('/p', options);
    expect(reloaded).toBeInstanceOf(Promise);
    expect(getRouteRenderData(render(await reloaded))).toBe('v2');
    expect(resolveRouteRequest('/q', options)).not.toBeInstanceOf(Promise);
  });

  it('should detach an invalidated in-flight load without caching its result', async () => {
    const first = deferred<string>();
    const replacement = deferred<string>();
    const loader = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(replacement.promise);
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };

    const oldRequest = resolveRouteRequest('/p', options);
    expect(oldRequest).toBeInstanceOf(Promise);

    invalidate('route-data:/p', { runtime: dataRuntime });
    const newRequest = resolveRouteRequest('/p', options);
    expect(newRequest).toBeInstanceOf(Promise);
    expect(loader).toHaveBeenCalledTimes(2);

    first.resolve('invalidated');
    expect(getRouteRenderData(render(await oldRequest))).toBe('invalidated');

    replacement.resolve('fresh');
    expect(getRouteRenderData(render(await newRequest))).toBe('fresh');
    expect(getRouteRenderData(render(resolveRouteRequest('/p', options)))).toBe(
      'fresh'
    );
  });

  it('should keep cached data and ignore a failed revalidation', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('good')
      .mockRejectedValueOnce(new Error('offline'));
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    const options = { registry, mode: 'spa' as const, dataRuntime };
    await resolveRouteRequest('/p', options);
    const hit = render(resolveRouteRequest('/p', options));
    await expect(getRouteRevalidation(hit)).rejects.toThrow('offline');
    expect(getRouteRenderData(render(resolveRouteRequest('/p', options)))).toBe(
      'good'
    );
  });

  it('should abort a shared request only when every waiting navigation is gone', async () => {
    const pending = deferred<string>();
    const signals: AbortSignal[] = [];
    const registry = createRouteRegistry(() => {
      route('/p', () => null, {
        loader: ({ signal }) => {
          signals.push(signal);
          return pending.promise;
        },
      });
    });
    const dataRuntime = runtime();
    const first = new AbortController();
    const second = new AbortController();
    const a = resolveRouteRequest('/p', {
      registry,
      mode: 'spa',
      dataRuntime,
      signal: first.signal,
    });
    const b = resolveRouteRequest('/p', {
      registry,
      mode: 'spa',
      dataRuntime,
      signal: second.signal,
    });
    first.abort();
    expect(signals[0]!.aborted).toBe(false);
    second.abort();
    expect(signals[0]!.aborted).toBe(true);
    pending.reject(new Error('aborted'));
    await expect(a).rejects.toThrow();
    await expect(b).rejects.toThrow();
  });

  it('should start a new request after every waiting navigation left a loader that ignores its signal', async () => {
    const loader = vi.fn(() => new Promise<string>(() => undefined));
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    const first = new AbortController();
    void resolveRouteRequest('/p', {
      registry,
      mode: 'spa',
      dataRuntime,
      signal: first.signal,
    });
    first.abort();
    void resolveRouteRequest('/p', { registry, mode: 'spa', dataRuntime });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should not share entries between registries that declare the same template', async () => {
    const dataRuntime = runtime();
    const first = createRouteRegistry(() => {
      route('/p', () => null, { loader: async () => 'first' });
    });
    const second = createRouteRegistry(() => {
      route('/p', () => null, { loader: async () => 'second' });
    });
    await resolveRouteRequest('/p', {
      registry: first,
      mode: 'spa',
      dataRuntime,
    });
    const other = await resolveRouteRequest('/p', {
      registry: second,
      mode: 'spa',
      dataRuntime,
    });
    expect(getRouteRenderData(render(other))).toBe('second');
  });

  it('should not cache server loaders', async () => {
    const loader = vi.fn(async () => 'data');
    const registry = createRouteRegistry(() => {
      route('/p', () => null, { loader });
    });
    const dataRuntime = runtime();
    await resolveRouteRequest('/p', { registry, mode: 'ssr', dataRuntime });
    await resolveRouteRequest('/p', { registry, mode: 'ssr', dataRuntime });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('should run group loaders beside the leaf loader and expose them by loader', async () => {
    const started: string[] = [];
    const layout = deferred<{ user: string }>();
    const leaf = deferred<string>();
    const loadUser = () => {
      started.push('group');
      return layout.promise;
    };
    const registry = createRouteRegistry(() => {
      group({ loader: loadUser }, () => {
        route('/p', () => null, {
          loader: () => {
            started.push('leaf');
            return leaf.promise;
          },
        });
      });
    });
    const pending = resolveRouteRequest('/p', {
      registry,
      mode: 'spa',
      dataRuntime: runtime(),
    });
    expect(started).toEqual(['group', 'leaf']);
    leaf.resolve('leaf data');
    layout.resolve({ user: 'ada' });
    const result = render(await pending);
    expect(getRouteRenderData(result)).toBe('leaf data');
    expect(getRouteLayoutData(result)?.get(loadUser)).toEqual({ user: 'ada' });
  });

  it('should validate staleTimeMs at registration', () => {
    expect(() =>
      createRouteRegistry(() => {
        route('/p', () => null, { staleTimeMs: -1 });
      })
    ).toThrow(RangeError);
    expect(() =>
      createRouteRegistry(() => {
        group({ staleTimeMs: Number.NaN }, () => undefined);
      })
    ).toThrow(RangeError);
  });
});
