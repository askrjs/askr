/* eslint-disable unicorn/no-thenable -- These fixtures exercise PromiseLike assimilation and failure cases. */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ResourceCell } from '../../../src/core/api/resource-cell';
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
  it('should keep only the refreshed execution when a pending subscriber refreshes synchronously', () => {
    let starts = 0;
    let cell!: ResourceCell<string>;
    let refreshed = false;
    cell = resource(() => `value:${++starts}`);
    cell.subscribe(() => {
      if (cell.snapshot.pending && !refreshed) {
        refreshed = true;
        cell.refresh();
      }
    });

    cell.start();

    expect(starts).toBe(1);
    expect(cell.snapshot).toMatchObject({
      value: 'value:1',
      pending: false,
      error: null,
    });
  });

  it('should keep the refreshed result when a settled subscriber refreshes synchronously', () => {
    let starts = 0;
    const cell = resource(() => `value:${++starts}`);
    let refreshed = false;
    cell.subscribe(() => {
      if (cell.snapshot.value === 'value:1' && !refreshed) {
        refreshed = true;
        cell.refresh();
      }
    });

    cell.start();

    expect(starts).toBe(2);
    expect(cell.snapshot).toMatchObject({
      value: 'value:2',
      pending: false,
      error: null,
    });
  });

  it('should stop notifying subscribers when a settled subscriber disposes the resource', () => {
    const cell = resource(() => 'ready');
    const notified: string[] = [];
    cell.subscribe(() => {
      if (cell.snapshot.value === 'ready') cell.dispose();
    });
    cell.subscribe(() => {
      if (cell.snapshot.value === 'ready') {
        notified.push('later subscriber');
      }
    });

    cell.start();

    expect(cell.snapshot.value).toBe('ready');
    expect(notified).toEqual([]);
  });

  it('should reject a thenable that resolves to itself', async () => {
    // eslint-disable-next-line unicorn/no-thenable -- Intentional self-resolution regression fixture.
    const self = {
      then(resolve: (value: unknown) => void) {
        resolve(self);
      },
    } as PromiseLike<string>;
    const cell = resource(() => self);

    cell.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot.pending).toBe(false);
    expect(cell.snapshot.error).toMatchObject({ name: 'TypeError' });
  });

  it('should reject a cycle across nested thenables', async () => {
    let first!: PromiseLike<unknown>;
    let second!: PromiseLike<unknown>;
    // eslint-disable-next-line unicorn/no-thenable -- Intentional cyclic thenable regression fixture.
    first = {
      then(resolve: (value: unknown) => void) {
        resolve(second);
      },
    } as unknown as PromiseLike<unknown>;
    // eslint-disable-next-line unicorn/no-thenable -- Intentional cyclic thenable regression fixture.
    second = {
      then(resolve: (value: unknown) => void) {
        resolve(first);
      },
    } as unknown as PromiseLike<unknown>;
    const cell = resource(() => first as PromiseLike<string>);

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot.pending).toBe(false);
    expect(cell.snapshot.error).toMatchObject({ name: 'TypeError' });
  });

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

  it('should not assimilate a stale thenable after its getter refreshes the resource', async () => {
    let cell!: ResourceCell<string>;
    let starts = 0;
    let thenReads = 0;
    let staleThenCalls = 0;
    const stale = Object.defineProperty({}, 'then', {
      get() {
        thenReads += 1;
        if (thenReads === 1) cell.refresh();
        return (resolve: (value: string) => void) => {
          staleThenCalls += 1;
          resolve('stale');
        };
      },
    }) as PromiseLike<string>;
    cell = resource(() => (starts++ === 0 ? stale : Promise.resolve('fresh')));

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(staleThenCalls).toBe(0);
    expect(cell.snapshot.value).toBe('fresh');
  });

  it('should read a then accessor once before invoking its method', async () => {
    let cell!: ResourceCell<string>;
    let starts = 0;
    let thenReads = 0;
    let staleThenCalls = 0;
    const stale = Object.defineProperty({}, 'then', {
      get() {
        thenReads += 1;
        return (resolve: (value: string) => void) => {
          staleThenCalls += 1;
          cell.refresh();
          resolve('stale');
        };
      },
    }) as PromiseLike<string>;
    cell = resource(() => (starts++ === 0 ? stale : Promise.resolve('fresh')));

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(thenReads).toBe(1);
    expect(staleThenCalls).toBe(1);
    expect(cell.snapshot.value).toBe('fresh');
  });

  it('should not re-read a native promise then accessor after it refreshes the resource', async () => {
    let cell!: ResourceCell<string>;
    let starts = 0;
    let thenReads = 0;
    let staleThenCalls = 0;
    const stale = Promise.resolve('stale');
    Object.defineProperty(stale, 'constructor', {
      get() {
        cell.refresh();
        return Object;
      },
    });
    // eslint-disable-next-line unicorn/no-thenable -- Intentional Promise assimilation regression fixture.
    Object.defineProperty(stale, 'then', {
      get() {
        thenReads += 1;
        return (resolve: (value: string) => void) => {
          staleThenCalls += 1;
          resolve('stale');
        };
      },
    });
    cell = resource(() =>
      starts++ === 0 ? (stale as PromiseLike<string>) : 'fresh'
    );

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(thenReads).toBe(1);
    expect(staleThenCalls).toBe(0);
    expect(cell.snapshot.value).toBe('fresh');
  });

  it('should not subscribe through a native promise after its constructor getter refreshes the resource', async () => {
    let cell!: ResourceCell<string>;
    let starts = 0;
    let staleThenCalls = 0;
    const stale = Promise.resolve('stale');
    Object.defineProperty(stale, 'constructor', {
      get() {
        cell.refresh();
        return Promise;
      },
    });
    Object.defineProperty(stale, 'then', {
      value(resolve: (value: string) => void) {
        staleThenCalls += 1;
        resolve('stale');
      },
    });
    cell = resource(() => (starts++ === 0 ? stale : 'fresh'));

    cell.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(staleThenCalls).toBe(0);
    expect(cell.snapshot.value).toBe('fresh');
  });

  it('should subscribe to a native promise through the captured then accessor', async () => {
    let cell!: ResourceCell<string>;
    let thenReads = 0;
    const result = Promise.resolve('ready');
    Object.defineProperty(result, 'then', {
      get() {
        thenReads += 1;
        if (thenReads === 2) cell.refresh();
        return Promise.prototype.then;
      },
    });
    cell = resource(() => result);

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(thenReads).toBe(1);
    expect(cell.generation).toBe(0);
    expect(cell.snapshot.value).toBe('ready');
  });

  it('should honor only the first callback from an overridden native promise then', async () => {
    const result = Promise.resolve('underlying');
    Object.defineProperty(result, 'then', {
      value(resolve: (value: string) => void, reject: (error: Error) => void) {
        resolve('first');
        resolve('second');
        reject(new Error('late rejection'));
      },
    });
    const cell = resource(() => result);

    cell.start();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'first',
      pending: false,
      error: null,
    });
  });

  it('should assimilate nested thenables returned by a captured then method', async () => {
    const cell = resource(
      () =>
        ({
          then(resolve: (value: unknown) => void) {
            resolve({
              then: (complete: (value: string) => void) => complete('nested'),
            });
          },
        }) as PromiseLike<string>
    );

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'nested',
      pending: false,
      error: null,
    });
  });

  it('should not invoke a nested thenable after its getter refreshes the resource', async () => {
    let cell!: ResourceCell<string>;
    let starts = 0;
    let nestedThenCalls = 0;
    const nested = Object.defineProperty({}, 'then', {
      get() {
        cell.refresh();
        return (resolve: (value: string) => void) => {
          nestedThenCalls += 1;
          resolve('stale');
        };
      },
    }) as PromiseLike<string>;
    const outer = {
      then(resolve: (value: unknown) => void) {
        resolve(nested);
      },
    } as PromiseLike<string>;
    cell = resource(() => (starts++ === 0 ? outer : 'fresh'));

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toBe(2);
    expect(nestedThenCalls).toBe(0);
    expect(cell.snapshot.value).toBe('fresh');
  });

  it('should assimilate a Promise subclass through its captured then method', async () => {
    class DerivedPromise<T> extends Promise<T> {}
    const cell = resource(() => DerivedPromise.resolve('subclass'));

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'subclass',
      pending: false,
      error: null,
    });
  });

  it('should invoke a captured then method without reading its own call property', async () => {
    const then = (resolve: (value: string) => void) => resolve('ready');
    Object.defineProperty(then, 'call', {
      value: () => {
        throw new Error('shadowed call must not be invoked');
      },
    });
    const cell = resource(() => ({ then }) as unknown as PromiseLike<string>);

    cell.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'ready',
      pending: false,
      error: null,
    });
  });

  it('should invoke a nested captured then method without reading its own call property', async () => {
    const nestedThen = (resolve: (value: string) => void) => resolve('nested');
    Object.defineProperty(nestedThen, 'call', {
      value: () => {
        throw new Error('shadowed nested call must not be invoked');
      },
    });
    const cell = resource(
      () =>
        ({
          then(resolve: (value: unknown) => void) {
            resolve({ then: nestedThen });
          },
        }) as unknown as PromiseLike<string>
    );

    cell.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'nested',
      pending: false,
      error: null,
    });
  });

  it('should use the captured native promise then without reading its own call property', async () => {
    const then = (resolve: (value: string) => void) => resolve('native');
    Object.defineProperty(then, 'call', {
      value: () => {
        throw new Error('shadowed native call must not be invoked');
      },
    });
    const result = Promise.resolve('ignored');
    Object.defineProperty(result, 'then', { value: then });
    const cell = resource(() => result as unknown as PromiseLike<string>);

    cell.start();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: 'native',
      pending: false,
      error: null,
    });
  });

  it('should publish a throwing then method as a loader failure', async () => {
    const failure = new Error('then method failed');
    const cell = resource(
      () =>
        ({
          then() {
            throw failure;
          },
        }) as PromiseLike<string>
    );

    cell.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.snapshot).toMatchObject({
      value: null,
      pending: false,
      error: failure,
    });
  });

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

  it.each(['native promise', 'captured thenable'] as const)(
    'should ignore an asynchronous rejection after disposal of a %s',
    async (kind) => {
      let reject!: (reason: Error) => void;
      const result =
        kind === 'native promise'
          ? new Promise<string>((_resolve, fail) => {
              reject = fail;
            })
          : {
              then(
                _resolve: (value: string) => void,
                fail: (error: Error) => void
              ) {
                reject = fail;
              },
            };
      const cell = resource(() => result as unknown as PromiseLike<string>);
      cell.start();
      await Promise.resolve();
      if (kind === 'captured thenable') await Promise.resolve();
      const failure = new Error('late failure');

      cell.dispose();
      reject(failure);
      await Promise.resolve();
      await Promise.resolve();

      expect(cell.snapshot).toMatchObject({
        value: null,
        pending: true,
        error: null,
      });
    }
  );

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
