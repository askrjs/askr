import { expectError, expectType } from 'tsd';
import {
  createMutation,
  createQuery,
  invalidate,
  invalidateOnInterval,
  queryScope,
  type InvalidateOnIntervalOptions,
  type InvalidateOptions,
  type Mutation,
  type Query,
  type QueryConsistency,
  type QueryKeyPart,
  type QueryScope,
  type QueryStaleReason,
} from '@askrjs/askr/data';

const query = createQuery({
  key: 'user:123',
  fetch: async ({ signal }) => {
    expectType<AbortSignal>(signal);
    return { id: '123', name: 'Ada' };
  },
  isConsistent: (data) => {
    expectType<{ id: string; name: string }>(data);
    return data.name.length > 0;
  },
  reconcile: async (data, ctx) => {
    expectType<{ id: string; name: string }>(data);
    expectType<string>(ctx.key);
    return true;
  },
});

expectType<Query<{ id: string; name: string }>>(query);
expectType<{ id: string; name: string } | null>(query.data);
expectType<{} | null>(query.error);
expectType<boolean>(query.loading);
expectType<boolean>(query.refreshing);
expectType<boolean>(query.stale);
expectType<QueryConsistency>(query.consistency);
expectType<QueryStaleReason | null>(query.staleReason);
expectType<Promise<void>>(query.refresh());
expectType<void>(invalidate('user:'));
expectType<void>(invalidate('user:', { markPendingWrite: true }));

const scoped = queryScope('admin');
expectType<QueryScope>(scoped);
expectType<string>(scoped.key('buckets', 'main', 'files'));
expectType<string>(scoped.prefix('buckets', 'main'));
expectType<void>(scoped.invalidate(['buckets', 'main']));
expectType<void>(
  scoped.invalidate(['buckets', 'main'], { markPendingWrite: true })
);
const keyPart: QueryKeyPart = { page: 2, q: 'search' };
expectType<QueryKeyPart>(keyPart);

const invalidateOptions: InvalidateOptions = { markPendingWrite: false };
expectType<InvalidateOptions>(invalidateOptions);

const intervalOptions: InvalidateOnIntervalOptions = {
  intervalMs: 1000,
  activeOn: ['/', '/admin'] as const,
  visibleOnly: true,
  focusedOnly: false,
  markPendingWrite: true,
};
expectType<InvalidateOnIntervalOptions>(intervalOptions);
expectType<void>(invalidateOnInterval('user:', intervalOptions));
expectType<void>(invalidateOnInterval('user:', { intervalMs: 1000 }));

if (query.loading) {
  expectType<true>(query.loading);
  expectType<false>(query.refreshing);
  expectType<false>(query.stale);
  expectType<'fresh'>(query.consistency);
  expectType<null>(query.data);
  expectType<null>(query.error);
  expectType<null>(query.staleReason);
}

if (query.consistency === 'refreshing') {
  expectType<false>(query.loading);
  expectType<true>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<null>(query.staleReason);
}

if (query.consistency === 'pending-write') {
  expectType<false>(query.loading);
  expectType<true>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<null>(query.staleReason);
}

if (query.consistency === 'stale') {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string } | null>(query.data);
  expectType<{} | null>(query.error);
  expectType<'aborted' | 'error' | 'inconsistent'>(query.staleReason);
}

if (query.consistency === 'stale' && query.staleReason === 'inconsistent') {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<'inconsistent'>(query.staleReason);
}

if (query.consistency === 'stale' && query.staleReason === 'aborted') {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<'aborted'>(query.staleReason);
}

if (query.consistency === 'stale' && query.error === null) {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<'aborted' | 'inconsistent'>(query.staleReason);
}

if (query.consistency === 'stale' && query.data === null) {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<null>(query.data);
  expectType<{}>(query.error);
  expectType<'error'>(query.staleReason);
}

if (query.error !== null) {
  expectType<'stale'>(query.consistency);
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string } | null>(query.data);
  expectType<{}>(query.error);
  expectType<'error'>(query.staleReason);
}

if (query.staleReason === 'error') {
  expectType<'stale'>(query.consistency);
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<true>(query.stale);
  expectType<{ id: string; name: string } | null>(query.data);
  expectType<{}>(query.error);
}

if (query.consistency === 'fresh' && !query.loading) {
  expectType<false>(query.loading);
  expectType<false>(query.refreshing);
  expectType<false>(query.stale);
  expectType<{ id: string; name: string }>(query.data);
  expectType<null>(query.error);
  expectType<null>(query.staleReason);
}

const mutation = createMutation({
  action: async (input: { id: string }, { signal }) => {
    expectType<AbortSignal>(signal);
    return { length: input.id.length };
  },
  affects: (input, result) => {
    expectType<{ id: string }>(input);
    expectType<{ length: number }>(result);
    return ['user:'];
  },
  afterSuccess: 'invalidate',
});

expectType<Mutation<{ id: string }, { length: number }>>(mutation);
expectType<'idle' | 'pending' | 'success' | 'error'>(mutation.status);
expectType<boolean>(mutation.pending);
expectType<{} | null>(mutation.error);
expectType<{ length: number } | null>(mutation.result);
expectType<Promise<{ length: number }>>(mutation.execute({ id: '42' }));
expectType<void>(mutation.abort());
expectType<void>(mutation.reset());

if (mutation.pending) {
  expectType<'pending'>(mutation.status);
  expectType<true>(mutation.pending);
  expectType<null>(mutation.error);
  expectType<null>(mutation.result);
} else {
  expectType<'idle' | 'success' | 'error'>(mutation.status);
  expectType<false>(mutation.pending);
}

if (mutation.status === 'idle') {
  expectType<false>(mutation.pending);
  expectType<null>(mutation.error);
  expectType<null>(mutation.result);
}

if (mutation.status === 'success') {
  expectType<false>(mutation.pending);
  expectType<null>(mutation.error);
  expectType<{ length: number }>(mutation.result);
}

if (mutation.status === 'error') {
  expectType<false>(mutation.pending);
  expectType<{}>(mutation.error);
  expectType<null>(mutation.result);
}

expectError(invalidate(123));
expectError(queryScope(123));
expectError(scoped.key(Symbol('bad')));
expectError(scoped.invalidate('buckets'));
expectError(invalidateOnInterval('user:'));
expectError(invalidateOnInterval('user:', { activeOn: '/' }));
expectError(invalidateOnInterval('user:', { intervalMs: '1000' }));
expectError(
  createQuery({
    key: 'bad',
    fetch: ({ signal }) => {
      expectType<AbortSignal>(signal);
      return 'not-a-promise';
    },
  })
);
expectError(
  createQuery({
    key: 'null-result',
    fetch: async () => null,
  })
);
expectError(
  createQuery({
    key: 'undefined-result',
    fetch: async () => undefined,
  })
);
expectError(
  createMutation({
    action: (input: { id: string }) => input.id.length,
  })
);
