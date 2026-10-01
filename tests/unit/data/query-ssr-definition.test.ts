import { describe, expect, it, vi } from 'vite-plus/test';
import { createQuery, defineQuery } from '../../../src/data';
import { createDataRuntime } from '../../../src/data/data-runtime';
import { renderToStringSync } from '../../../src/ssr';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

describe('query definitions during SSR', () => {
  it.each([undefined, false, true])(
    'should suppress initial SSR fetches when skipInitialFetch is %s',
    (skipInitialFetch) => {
      const runtime = createDataRuntime();
      const fetch = vi.fn(async () => ({ name: 'Ada' }));
      const definition = defineQuery({ key: () => 'ssr:skip', fetch });

      renderToStringSync(() => {
        const query = createQuery(definition, undefined, {
          runtime,
          skipInitialFetch,
        });
        return query.data?.name ?? 'loading';
      });
      flushScheduler();

      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('should warn once given two inline readers of one key with different fetches', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = createDataRuntime();

    try {
      renderToStringSync(() => {
        const first = createQuery({
          runtime,
          key: 'ssr:conflict',
          fetch: async () => 'first',
        });
        const second = createQuery({
          runtime,
          key: 'ssr:conflict',
          fetch: async () => 'second',
        });
        return `${first.data ?? second.data ?? 'loading'}`;
      });

      const conflictWarnings = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes(
          '[askr] Conflicting shared query definition for key "ssr:conflict"'
        )
      );
      expect(conflictWarnings).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
