import { describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  lazy,
  resolveRouteMeta,
  resolveRouteRequest,
  route,
} from '../../../src/router';
import {
  getRouteRenderContext,
  getRouteRenderData,
} from '../../../src/router/resolution';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('parallel route resolution', () => {
  it('should start the lazy chunk, preload and loader together', async () => {
    const started: string[] = [];
    const chunk = deferred<{ default: () => null }>();
    const preload = deferred();
    const loader = deferred<string>();
    const Page = lazy(() => {
      started.push('chunk');
      return chunk.promise;
    });
    const registry = createRouteRegistry(() => {
      route('/p', Page, {
        preload: () => {
          started.push('preload');
          return preload.promise;
        },
        loader: () => {
          started.push('loader');
          return loader.promise;
        },
      });
    });

    const pending = resolveRouteRequest('/p', { registry, mode: 'spa' });
    await Promise.resolve();
    expect([...started].sort()).toEqual(['chunk', 'loader', 'preload']);

    chunk.resolve({ default: () => null });
    preload.resolve();
    loader.resolve('data');
    const result = await pending;
    expect(result?.kind).toBe('render');
  });

  it('should not publish a result before the slowest source settles', async () => {
    const chunk = deferred<{ default: () => null }>();
    const loader = deferred<string>();
    const registry = createRouteRegistry(() => {
      route(
        '/p',
        lazy(() => chunk.promise),
        { loader: () => loader.promise }
      );
    });
    let settled = false;
    const pending = Promise.resolve(
      resolveRouteRequest('/p', { registry, mode: 'spa' })
    ).then((value) => {
      settled = true;
      return value;
    });
    loader.resolve('data');
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    expect(settled).toBe(false);
    chunk.resolve({ default: () => null });
    const result = await pending;
    expect(getRouteRenderData(result as never)).toBe('data');
  });

  it('should pass the loader result to meta as context.data', async () => {
    const registry = createRouteRegistry(() => {
      route('/p', () => null, {
        loader: async () => ({ name: 'Ada' }),
        meta: (context) => ({
          title: `Hello ${(context.data as { name: string }).name}`,
        }),
      });
    });
    const result = await resolveRouteRequest('/p', { registry, mode: 'spa' });
    if (result?.kind !== 'render' || !result.record) throw new Error('render');
    const context = getRouteRenderContext(result)!;
    const meta = await resolveRouteMeta(result.record, {
      ...context,
      data: getRouteRenderData(result),
    });
    expect(meta.title).toBe('Hello Ada');
  });

  it('should start every metadata source before awaiting any of them', async () => {
    const started: string[] = [];
    const first = deferred<{ title: string }>();
    const second = deferred<{ description: string }>();
    const registry = createRouteRegistry(() => {
      route('/p', () => null, {
        meta: () => {
          started.push('a');
          return first.promise;
        },
      });
    });
    const record = registry.manifest.records[0]!;
    const twoSources = {
      ...record,
      metaChain: [
        () => {
          started.push('a');
          return first.promise;
        },
        () => {
          started.push('b');
          return second.promise;
        },
      ],
    };
    const pending = resolveRouteMeta(twoSources, {
      mode: 'spa',
      params: {},
      pathname: '/p',
      search: '',
      hash: '',
      href: '/p',
      auth: {
        authenticated: false,
        principal: null,
        session: null,
        tenant: null,
      },
      signal: new AbortController().signal,
    });
    expect(started).toEqual(['a', 'b']);
    second.resolve({ description: 'later' });
    first.resolve({ title: 'first' });
    expect(await pending).toMatchObject({
      title: 'first',
      description: 'later',
    });
  });
});
