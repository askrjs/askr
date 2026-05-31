import { flushScheduler } from '../../../test-utils/render/test-renderer';

export type ControlledDeferred<T> = {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
};

export function createControlledDeferred<T>(): ControlledDeferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

export async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}
