import { describe, expect, it } from 'vite-plus/test';
import { ResourceCell } from '../../../src/runtime/lifecycle/resource-cell';

describe('resource promise-like invariants', () => {
  it('should await thenable resource loaders like native promises', async () => {
    const thenable: PromiseLike<string> = {
      // eslint-disable-next-line unicorn/no-thenable -- Intentional PromiseLike regression fixture.
      then(resolve) {
        queueMicrotask(() => resolve('ready'));
        return Promise.resolve('ready');
      },
    };
    const cell = new ResourceCell<string>(
      () => thenable as unknown as Promise<string>,
      [],
      null
    );

    cell.start();

    expect(cell.pending).toBe(true);
    expect(cell.value).toBeNull();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cell.pending).toBe(false);
    expect(cell.value).toBe('ready');
  });
});
