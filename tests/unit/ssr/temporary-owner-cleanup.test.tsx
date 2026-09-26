import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { getCurrentComponentInstance } from '../../../src/runtime';
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
      const owner = getCurrentComponentInstance()!.owner;
      (owner.cleanups ??= []).push(() => {
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
});
