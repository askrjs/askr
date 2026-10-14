import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { getOwner } from '../../../src/core/reactive/owner';
import { renderToStringSync } from '../../../src/ssr';

// SSR temporary owners keep cleanup failures on the render's error path. The
// server has no reportError, so a deferred report would become an uncaught
// exception in the host process instead.
describe('SSR temporary owner cleanup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should throw a component cleanup failure from the render', async () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    const error = new Error('ssr cleanup failed');
    const App = () => {
      getOwner()!.onCleanup(() => {
        throw error;
      });
      return <div>ok</div>;
    };

    let thrown: unknown;
    try {
      renderToStringSync(App);
    } catch (caught) {
      thrown = caught;
    }
    await Promise.resolve();
    await Promise.resolve();

    const leaves: unknown[] = [];
    const collect = (value: unknown): void => {
      if (value instanceof AggregateError) value.errors.forEach(collect);
      else leaves.push(value);
    };
    collect(thrown);
    expect(leaves).toEqual([error]);
    expect(reportError).not.toHaveBeenCalled();
  });

  it.each(['success', 'throw'] as const)(
    'should drain multiple cleanup failures after a %s render and leave the next render usable',
    async (mode) => {
      const reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      const renderFailure = new Error('component failed');
      const firstCleanup = new Error('first cleanup failed');
      const secondCleanup = new Error('second cleanup failed');
      let owner!: NonNullable<ReturnType<typeof getOwner>>;
      const App = () => {
        owner = getOwner()!;
        owner.onCleanup(() => {
          throw firstCleanup;
        });
        owner.onCleanup(() => {
          throw secondCleanup;
        });
        if (mode === 'throw') throw renderFailure;
        return <p>complete</p>;
      };
      let thrown: unknown;
      try {
        renderToStringSync(App);
      } catch (error) {
        thrown = error;
      }
      const leaves: unknown[] = [];
      const collect = (value: unknown): void => {
        if (value instanceof AggregateError) value.errors.forEach(collect);
        else leaves.push(value);
      };
      collect(thrown);
      expect(leaves).toEqual(
        mode === 'throw'
          ? [renderFailure, secondCleanup, firstCleanup]
          : [secondCleanup, firstCleanup]
      );
      expect(owner.disposed).toBe(true);
      expect(renderToStringSync(() => <p>retry</p>)).toBe('<p>retry</p>');
      await Promise.resolve();
      expect(reportError).not.toHaveBeenCalled();
    }
  );
});
