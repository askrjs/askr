import { expectError, expectType } from 'tsd';
import {
  createMutation,
  createQuery,
  invalidate,
  type Mutation,
  type Query,
  type QueryConsistency,
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
expectType<unknown | null>(query.error);
expectType<boolean>(query.loading);
expectType<boolean>(query.refreshing);
expectType<boolean>(query.stale);
expectType<QueryConsistency>(query.consistency);
expectType<Promise<void>>(query.refresh());
expectType<void>(invalidate('user:'));

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
expectType<unknown | null>(mutation.error);
expectType<{ length: number } | null>(mutation.result);
expectType<Promise<{ length: number }>>(mutation.execute({ id: '42' }));
expectType<void>(mutation.abort());
expectType<void>(mutation.reset());

expectError(invalidate(123));
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
  createMutation({
    action: (input: { id: string }) => input.id.length,
  })
);
