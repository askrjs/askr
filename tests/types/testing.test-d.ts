import { expectAssignable, expectError, expectType } from 'tsd';
import {
  createInvalidationRecorder,
  getRouteWarnings,
  matchRoute,
  mockQuery,
  queryState,
  type InvalidationRecord,
  type InvalidationRecorder,
  type RoutePatternWarning,
  type MockQueryOptions,
  type MockRefresh,
} from '@askrjs/askr/testing';
import type { Query } from '@askrjs/askr/data';
import { getManifest } from '@askrjs/askr/router';
import type { RouteMatch } from '@askrjs/askr/router';

const refresh: MockRefresh = async () => {};
const options: MockQueryOptions = { refresh };
expectAssignable<MockQueryOptions>(options);

const fresh = mockQuery({ id: '123', name: 'Ada' }, options);
expectType<Query<{ id: string; name: string }>>(fresh);
expectType<Promise<void>>(fresh.refresh());

const loading = mockQuery.loading<{ id: string }>();
expectType<Query<{ id: string }>>(loading);

const failed = mockQuery.error(new Error('boom'));
expectType<Query<{}>>(failed);

const failedWithData = mockQuery.error(new Error('boom'), { id: '123' });
expectType<Query<{ id: string }>>(failedWithData);

const refreshing = mockQuery.refreshing({ id: '123' });
expectType<Query<{ id: string }>>(refreshing);

const stale = mockQuery.stale({ id: '123' }, 'aborted');
expectType<Query<{ id: string }>>(stale);

const pendingWrite = mockQuery.pendingWrite({ id: '123' });
expectType<Query<{ id: string }>>(pendingWrite);

const friendlyFresh = queryState.fresh({ id: '123' });
expectType<Query<{ id: string }>>(friendlyFresh);

const friendlyLoading = queryState.loading<{ id: string }>();
expectType<Query<{ id: string }>>(friendlyLoading);

const friendlyFailed = queryState.error(new Error('boom'), { id: '123' });
expectType<Query<{ id: string }>>(friendlyFailed);

const friendlyRefreshing = queryState.refreshing({ id: '123' });
expectType<Query<{ id: string }>>(friendlyRefreshing);

const friendlyStale = queryState.stale({ id: '123' });
expectType<Query<{ id: string }>>(friendlyStale);

const friendlyPendingWrite = queryState.pendingWrite({ id: '123' });
expectType<Query<{ id: string }>>(friendlyPendingWrite);

const record: InvalidationRecord = {
  prefix: 'users:',
  markPendingWrite: false,
};
expectAssignable<InvalidationRecord>(record);

const recorder = createInvalidationRecorder();
expectType<InvalidationRecorder>(recorder);
expectType<readonly InvalidationRecord[]>(recorder.calls);
expectType<readonly string[]>(recorder.prefixes);
expectType<void>(recorder.clear());
expectType<void>(recorder.stop());

const routeMatch = matchRoute('/admin/buckets/main/files/a/b', {
  manifest: getManifest(),
});
expectType<RouteMatch | null>(routeMatch);

const routeWarnings = getRouteWarnings({ manifest: getManifest() });
expectType<RoutePatternWarning[]>(routeWarnings);
const routeWarning: RoutePatternWarning = {
  kind: 'route-collision',
  path: '/files/{*path}',
  conflictingPath: '/files/blob/{id}',
  segment: 'blob',
  namespace: undefined,
  message:
    'Route "/files/blob/{id}" reserves segment "blob" under named splat route "/files/{*path}".',
};
expectAssignable<RoutePatternWarning>(routeWarning);

expectError(mockQuery(null));
expectError(mockQuery.loading(123));
expectError(mockQuery.stale({ id: '123' }, 'error'));
expectError(queryState.fresh(null));
