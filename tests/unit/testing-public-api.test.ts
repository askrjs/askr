import { describe, expect, it, vi } from 'vite-plus/test';
import { invalidate } from '@askrjs/askr/data';
import {
  createInvalidationRecorder,
  mockQuery,
  queryState,
} from '@askrjs/askr/testing';

describe('testing public API', () => {
  it('should create a fresh query mock with stable defaults', async () => {
    const query = mockQuery({ id: '123', name: 'Ada' });

    expect(query.data).toEqual({ id: '123', name: 'Ada' });
    expect(query.error).toBeNull();
    expect(query.loading).toBe(false);
    expect(query.refreshing).toBe(false);
    expect(query.stale).toBe(false);
    expect(query.consistency).toBe('fresh');
    expect(query.staleReason).toBeNull();
    await expect(query.refresh()).resolves.toBeUndefined();
  });

  it('should create query mocks for loading, error, refreshing, stale, and pending-write states', () => {
    const error = new Error('boom');

    expect(mockQuery.loading<{ id: string }>()).toMatchObject({
      data: null,
      error: null,
      loading: true,
      refreshing: false,
      stale: false,
      consistency: 'fresh',
      staleReason: null,
    });
    expect(mockQuery.error(error)).toMatchObject({
      data: null,
      error,
      loading: false,
      refreshing: false,
      stale: true,
      consistency: 'stale',
      staleReason: 'error',
    });
    expect(mockQuery.error(error, { id: '123' })).toMatchObject({
      data: { id: '123' },
      error,
      loading: false,
      refreshing: false,
      stale: true,
      consistency: 'stale',
      staleReason: 'error',
    });
    expect(mockQuery.refreshing({ id: '123' })).toMatchObject({
      data: { id: '123' },
      error: null,
      loading: false,
      refreshing: true,
      stale: true,
      consistency: 'refreshing',
      staleReason: null,
    });
    expect(mockQuery.stale({ id: '123' })).toMatchObject({
      data: { id: '123' },
      error: null,
      loading: false,
      refreshing: false,
      stale: true,
      consistency: 'stale',
      staleReason: 'inconsistent',
    });
    expect(mockQuery.pendingWrite({ id: '123' })).toMatchObject({
      data: { id: '123' },
      error: null,
      loading: false,
      refreshing: true,
      stale: true,
      consistency: 'pending-write',
      staleReason: null,
    });
  });

  it('should expose queryState helpers as a friendly query fixture alias', () => {
    const error = new Error('boom');
    const stateOnly = <T extends { refresh: unknown }>(query: T) => {
      const { refresh: _refresh, ...state } = query;
      return state;
    };

    expect(stateOnly(queryState.fresh({ id: '123' }))).toEqual(
      stateOnly(mockQuery({ id: '123' }))
    );
    expect(stateOnly(queryState.loading<{ id: string }>())).toEqual(
      stateOnly(mockQuery.loading<{ id: string }>())
    );
    expect(stateOnly(queryState.error(error, { id: '123' }))).toEqual(
      stateOnly(mockQuery.error(error, { id: '123' }))
    );
    expect(stateOnly(queryState.refreshing({ id: '123' }))).toEqual(
      stateOnly(mockQuery.refreshing({ id: '123' }))
    );
    expect(stateOnly(queryState.stale({ id: '123' }))).toEqual(
      stateOnly(mockQuery.stale({ id: '123' }))
    );
    expect(stateOnly(queryState.pendingWrite({ id: '123' }))).toEqual(
      stateOnly(mockQuery.pendingWrite({ id: '123' }))
    );
  });

  it('should allow query mock refresh functions to be overridden', async () => {
    const refresh = vi.fn();
    const query = mockQuery.refreshing({ id: '123' }, { refresh });

    await query.refresh();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('should record invalidation calls without a test-runner dependency', () => {
    const recorder = createInvalidationRecorder();

    invalidate('users:');
    invalidate('teams:');
    invalidate('projects:', { markPendingWrite: true });

    expect(recorder.calls).toEqual([
      { prefix: 'users:', markPendingWrite: false },
      { prefix: 'teams:', markPendingWrite: false },
      { prefix: 'projects:', markPendingWrite: true },
    ]);
    expect(recorder.prefixes).toEqual(['users:', 'teams:', 'projects:']);

    recorder.clear();
    expect(recorder.calls).toEqual([]);
    expect(recorder.prefixes).toEqual([]);

    recorder.stop();
    invalidate('projects:');
    expect(recorder.calls).toEqual([]);
  });
});
