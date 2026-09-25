import { describe, expect, it, vi } from 'vite-plus/test';
import { createQuery } from '../../../src/data';
import { createDataRuntime } from '../../../src/data/data-runtime';
import { renderToStringSync } from '../../../src/ssr';

describe('query definitions during SSR', () => {
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
