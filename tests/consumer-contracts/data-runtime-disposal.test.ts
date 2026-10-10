import { expect, test } from 'vitest';
import {
  createDataRuntime,
  createMutation,
  createQuery,
  createQueryPrefetchContext,
  defineQuery,
  dehydrateDataRuntime,
  disposeDataRuntime,
  getDefaultDataRuntime,
  hydrateDataRuntime,
} from '@askrjs/askr/data';

test('should retire installed data handles without reviving late mutation results', async () => {
  const runtime = createDataRuntime();
  let complete!: (value: string) => void;
  let signal!: AbortSignal;
  let rollbacks = 0;
  let affects = 0;
  const mutation = createMutation({
    runtime,
    action: (_: void, context) => {
      signal = context.signal;
      return new Promise<string>((resolve) => {
        complete = resolve;
      });
    },
    optimistic: () => () => {
      rollbacks += 1;
    },
    affects: () => {
      affects += 1;
      return ['private'];
    },
    afterSuccess: 'invalidate',
  });
  const failure = mutation.execute(undefined).catch((error: unknown) => error);
  const query = createQuery({
    runtime,
    key: 'private',
    initialData: { secret: 'old' },
    fetch: async () => ({ secret: 'new' }),
  });
  hydrateDataRuntime(runtime, { private: { secret: 'prefetched' } });
  disposeDataRuntime(runtime);
  expect(signal.aborted).toBe(true);
  expect(await failure).toMatchObject({ name: 'AbortError' });
  expect(query.data).toBeNull();
  expect(query.error).toMatchObject({ name: 'AbortError' });
  expect(dehydrateDataRuntime(runtime)).toEqual({});
  complete('late');
  await Promise.resolve();
  await Promise.resolve();
  expect(mutation.status).toBe('idle');
  expect(mutation.result).toBeNull();
  expect(rollbacks).toBe(1);
  expect(affects).toBe(0);
  expect(() => query.refresh()).toThrow(/disposed/i);
  expect(() => disposeDataRuntime(runtime)).not.toThrow();
});

test('should stop installed prefetch callers and preserve a different isolated owner', async () => {
  const runtime = createDataRuntime();
  const survivor = createDataRuntime();
  const query = defineQuery({
    key: () => 'private',
    fetch: () => new Promise<{}>(() => {}),
  });
  const first = createQueryPrefetchContext({ runtime });
  const second = createQueryPrefetchContext({ runtime });
  const pending = Promise.allSettled([
    first.prefetch(query, undefined),
    second.prefetch(query, undefined),
  ]);
  disposeDataRuntime(runtime);
  for (const result of await pending) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected')
      expect(result.reason).toMatchObject({ name: 'AbortError' });
  }
  hydrateDataRuntime(survivor, { private: 'independent' });
  expect(dehydrateDataRuntime(survivor)).toEqual({ private: 'independent' });
  disposeDataRuntime(survivor);
  expect(() => disposeDataRuntime(getDefaultDataRuntime())).toThrow(
    /default.*isolated/i
  );
});
