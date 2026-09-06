import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ResourceCell } from '../../../src/runtime/lifecycle/resource-cell';
import { logger } from '../../../src/common/logger';

const cells: ResourceCell<string>[] = [];
function resource(
  loader: ConstructorParameters<typeof ResourceCell<string>>[0]
) {
  const cell = new ResourceCell(loader, [], null);
  cells.push(cell);
  return cell;
}
afterEach(() => {
  for (const cell of cells.splice(0)) cell.dispose();
  vi.restoreAllMocks();
});

describe('resource execution and publication isolation', () => {
  it('should settle an async failure even when its string conversion throws', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const cell = resource(() =>
      Promise.reject({
        toString() {
          throw new Error('conversion failed');
        },
      })
    );
    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.snapshot.pending).toBe(false);
    expect(cell.snapshot.error?.message).toBe(
      'Resource error normalization failed'
    );
  });

  it.each(['sync', 'async'] as const)(
    'should preserve refresh during %s error normalization',
    async (mode) => {
      const failure = {
        toString() {
          cell.setLoader(() => 'new');
          cell.refresh();
          return 'stale error';
        },
      };
      const cell = resource(() => {
        if (mode === 'async') return Promise.reject(failure);
        throw failure;
      });
      cell.start();
      await Promise.resolve();
      await Promise.resolve();
      expect(cell.snapshot).toMatchObject({
        value: 'new',
        pending: false,
        error: null,
      });
    }
  );

  it('should publish promise assimilation failures through the loader contract', () => {
    const failure = new Error('constructor getter failed');
    const result = Promise.resolve('ready');
    Object.defineProperty(result, 'constructor', {
      get() {
        throw failure;
      },
    });
    const cell = resource(() => result);
    expect(() => cell.start()).not.toThrow();
    expect(cell.snapshot).toMatchObject({
      value: null,
      pending: false,
      error: failure,
    });
  });

  it('should continue pending notification and execution after a subscriber throws', () => {
    const report = vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('logger failed');
    });
    const cell = resource(() => 'ready');
    cell.subscribe(() => {
      throw new Error('subscriber failed');
    });
    const observed: Array<string | null> = [];
    cell.subscribe(() => observed.push(cell.snapshot.value));
    expect(() => cell.start()).not.toThrow();
    expect(observed).toEqual([null, 'ready']);
    expect(cell.snapshot.error).toBeNull();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('should publish a throwing then getter as a loader failure', () => {
    const failure = new Error('then getter failed');
    // eslint-disable-next-line unicorn/no-thenable -- Intentional throwing thenable regression fixture.
    const result = Object.defineProperty({}, 'then', {
      get: () => {
        throw failure;
      },
    }) as PromiseLike<string>;
    const cell = resource(() => result);
    expect(() => cell.start()).not.toThrow();
    expect(cell.snapshot).toMatchObject({
      value: null,
      pending: false,
      error: failure,
    });
  });

  it('should preserve async loader failure when notification and logging throw', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('logger failed');
    });
    const failure = new Error('loader failed');
    const cell = resource(() => Promise.reject(failure));
    cell.subscribe(() => {
      if (!cell.snapshot.pending) throw new Error('subscriber failed');
    });
    const observed: Error[] = [];
    cell.subscribe(() => {
      if (cell.snapshot.error) observed.push(cell.snapshot.error);
    });
    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.snapshot.error).toBe(failure);
    expect(observed).toEqual([failure]);
  });

  it('should preserve async success and notify siblings when a subscriber throws', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const cell = resource(() => Promise.resolve('ready'));
    cell.subscribe(() => {
      if (cell.snapshot.value === 'ready' && !cell.snapshot.error)
        throw new Error('subscriber failed');
    });
    const observed: Array<Error | null> = [];
    cell.subscribe(() => {
      if (!cell.snapshot.pending) observed.push(cell.snapshot.error);
    });
    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(cell.snapshot).toMatchObject({
      value: 'ready',
      pending: false,
      error: null,
    });
    expect(observed).toEqual([null]);
  });

  it.each(['return', 'throw'] as const)(
    'should ignore stale synchronous %s after loader refresh',
    (outcome) => {
      let first = true;
      const cell = resource(() => {
        if (!first) return 'new';
        first = false;
        cell.refresh();
        if (outcome === 'throw') throw new Error('stale');
        return 'old';
      });
      cell.start();
      expect(cell.snapshot).toMatchObject({
        value: 'new',
        pending: false,
        error: null,
      });
    }
  );

  it('should stop execution when pending notification disposes the resource', () => {
    const loader = vi.fn(() => 'stale');
    const cell = resource(loader);
    cell.subscribe(() => cell.dispose());
    cell.start();
    expect(loader).not.toHaveBeenCalled();
    expect(cell.value).toBeNull();
  });

  it('should preserve a refresh started by the previous signal abort handler', () => {
    const cell = resource(() => 'initial');
    cell.start();
    cell.controller!.signal.addEventListener(
      'abort',
      () => {
        cell.setLoader(() => 'new');
        cell.refresh();
        cell.setLoader(() => 'stale');
      },
      { once: true }
    );
    cell.start();
    expect(cell.snapshot.value).toBe('new');
    expect(cell.controller!.signal.aborted).toBe(false);
  });

  it('should ignore a synchronous result after the loader aborts its execution', () => {
    const cell = resource(() => {
      cell.abort();
      return 'stale';
    });
    cell.start();
    expect(cell.value).toBeNull();
    expect(cell.snapshot.value).toBeNull();
  });
});
