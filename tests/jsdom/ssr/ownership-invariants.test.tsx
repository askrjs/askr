import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { getCurrentComponentInstance, getSignal } from '../../../src/runtime';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { renderToStringSync } from '../../../src/ssr';
import { getRenderContext } from '../../../src/ssr/context';
import { createQuery } from '../../../src/data';

describe('SSR ownership invariants', () => {
  beforeEach(() => {
    _resetDefaultPortal();
  });

  afterEach(() => {
    _resetDefaultPortal();
  });

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

  it('should not leak portal scope state when SSR cleanup throws', () => {
    function ThrowingChild() {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected SSR component instance');
      }

      instance.cleanupStrict = true;
      (instance.ownership.cleanups ??= []).push(() => {
        throw new Error('ssr cleanup failed');
      });

      return (
        <>
          <span>{'child'}</span>
          <Portal>{'child-portal'}</Portal>
        </>
      );
    }

    function Parent() {
      return (
        <div>
          <Portal>{'parent-portal'}</Portal>
          <ThrowingChild />
        </div>
      );
    }

    expect(() => renderToStringSync(Parent)).toThrow(/Cleanup failed/i);

    DefaultPortal.render({ children: 'Early' });

    const html = renderToStringSync(() => <div>{'next'}</div>);

    expect(html).toBe('<div>next</div>');
  });
});
