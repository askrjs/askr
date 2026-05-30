import { describe, expect, it } from 'vite-plus/test';
import { getSignal } from '../../../src/runtime/component';
import { renderToStringSync } from '../../../src/ssr';
import { getRenderContext } from '../../../src/ssr/context';
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
});
