import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

type SSRContextModule = typeof import('../../../src/ssr/context');

const FALLBACK_ASYNC_ERROR =
  '[Askr] async SSR render context fallback is unsupported in this environment. Use synchronous SSR rendering or a runtime with AsyncLocalStorage.';

async function importFallbackContextModule(): Promise<SSRContextModule> {
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

  vi.resetModules();

  try {
    globalRecord.process = fallbackProcess;
    return await import('../../../src/ssr/context');
  } finally {
    if (originalProcess === undefined) {
      delete globalRecord.process;
    } else {
      globalRecord.process = originalProcess;
    }
  }
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
});
