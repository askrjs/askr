import { describe, expect, it, vi } from 'vite-plus/test';
import { getSignal } from '../../../src/index';
import { renderToStringSync } from '../../../src/ssr';
import {
  createRenderContext,
  getRenderContext,
  withRenderContext,
} from '../../../src/ssr/context';
import { createQuery } from '../../../src/data';

describe('SSR ownership invariants', () => {
  it('should dispose temporary component ownership after rendering', () => {
    let signal: AbortSignal | undefined;

    renderToStringSync(() => {
      signal = getSignal();
      return <div>rendered</div>;
    });

    expect(signal?.aborted).toBe(true);
  });

  it('should retain request query cache entries until sibling SSR components finish', () => {
    const cacheSizes: number[] = [];

    const QueryChild = ({ label }: { label: string }) => {
      createQuery({
        key: 'users:ssr',
        fetch: async () => label,
      });
      cacheSizes.push(getRenderContext()?.queryCache?.size ?? 0);
      return <span>{label}</span>;
    };

    renderToStringSync(() => (
      <div>
        <QueryChild label="first" />
        <QueryChild label="second" />
      </div>
    ));

    expect(cacheSizes).toEqual([1, 1]);
  });

  it('should reuse a query-cache runtime when render context omits dataRuntime', () => {
    const context = createRenderContext();
    context.dataRuntime = undefined;
    const fetch = async () => 'first';
    const conflictingFetch = async () => 'second';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      withRenderContext(context, () => {
        const first = createQuery({
          key: 'legacy-query-cache-runtime',
          fetch,
          skipInitialFetch: true,
        });
        const second = createQuery({
          key: 'legacy-query-cache-runtime',
          fetch: conflictingFetch,
          skipInitialFetch: true,
        });

        expect(first).toBe(second);
        expect(context.queryCache?.get('legacy-query-cache-runtime')).toBe(
          first
        );
      });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[askr] Conflicting shared query definition for key "legacy-query-cache-runtime"'
        )
      );
    } finally {
      warn.mockRestore();
    }
  });
});
