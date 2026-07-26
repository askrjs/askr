import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

type SSRContextModule = typeof import('../../../src/ssr/context');

const FALLBACK_ASYNC_ERROR =
  '[Askr] async SSR render context fallback is unsupported in this environment. Use synchronous SSR rendering or a runtime with AsyncLocalStorage.';

async function withFallbackProcess<T>(work: () => Promise<T>): Promise<T> {
  const globalRecord = globalThis as unknown as Record<string, unknown>;
  const originalProcess = globalRecord.process;
  const fallbackProcess =
    originalProcess && typeof originalProcess === 'object'
      ? new Proxy(originalProcess as object, {
          get(target, prop, receiver) {
            if (prop === 'versions') {
              return {};
            }
            return Reflect.get(target, prop, receiver);
          },
        })
      : { versions: {} };

  try {
    globalRecord.process = fallbackProcess;
    return await work();
  } finally {
    if (originalProcess === undefined) {
      delete globalRecord.process;
    } else {
      globalRecord.process = originalProcess;
    }
  }
}

async function importFallbackContextModule(): Promise<SSRContextModule> {
  vi.resetModules();
  return withFallbackProcess(() => import('../../../src/ssr/context'));
}

afterEach(() => {
  vi.resetModules();
});

describe('SSR fallback render context invariants', () => {
  it('should restore nested synchronous fallback contexts', async () => {
    const { createRenderContext, getRenderContext, withRenderContext } =
      await importFallbackContextModule();
    const outer = createRenderContext(1, { url: '/outer' });
    const inner = createRenderContext(2, { url: '/inner' });

    expect(getRenderContext()).toBeNull();

    const result = withRenderContext(outer, () => {
      expect(getRenderContext()).toBe(outer);

      const innerResult = withRenderContext(inner, () => {
        expect(getRenderContext()).toBe(inner);
        return 'inner result';
      });

      expect(innerResult).toBe('inner result');
      expect(getRenderContext()).toBe(outer);
      return 'outer result';
    });

    expect(result).toBe('outer result');
    expect(getRenderContext()).toBeNull();
  });

  it('should reject promise-like callbacks in fallback render contexts', async () => {
    const { createRenderContext, getRenderContext, withRenderContext } =
      await importFallbackContextModule();
    const ctx = createRenderContext();

    expect(() =>
      withRenderContext(ctx, () => ({
        // eslint-disable-next-line unicorn/no-thenable -- Intentional PromiseLike fallback-context regression fixture.
        then() {
          return undefined;
        },
      }))
    ).toThrow(FALLBACK_ASYNC_ERROR);
    expect(getRenderContext()).toBeNull();
  });

  it('should reject async fallback contexts before request work begins', async () => {
    const { createRenderContext, getRenderContext, withRenderContextAsync } =
      await importFallbackContextModule();
    const first = createRenderContext(1, { url: '/first' });
    const second = createRenderContext(2, { url: '/second' });
    const firstWork = vi.fn(async () => getRenderContext()?.url);
    const secondWork = vi.fn(async () => getRenderContext()?.url);

    const results = await withFallbackProcess(() =>
      Promise.allSettled([
        withRenderContextAsync(first, firstWork),
        withRenderContextAsync(second, secondWork),
      ])
    );

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toEqual(new Error(FALLBACK_ASYNC_ERROR));
      }
    }
    expect(firstWork).not.toHaveBeenCalled();
    expect(secondWork).not.toHaveBeenCalled();
    expect(getRenderContext()).toBeNull();
  });
});
