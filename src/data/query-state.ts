import type { QueryState, QueryStaleReason } from './types';

/** Complete query states; transitions never inherit unrelated status flags. */
export function loadingQueryState<T>(): QueryState<T> {
  return {
    data: null,
    error: null,
    loading: true,
    refreshing: false,
    stale: false,
    consistency: 'fresh',
    staleReason: null,
  };
}
export function freshQueryState<T>(data: T): QueryState<T> {
  return {
    data,
    error: null,
    loading: false,
    refreshing: false,
    stale: false,
    consistency: 'fresh',
    staleReason: null,
  };
}
export function refreshingQueryState<T>(
  data: T,
  consistency: 'refreshing' | 'pending-write' = 'refreshing'
): QueryState<T> {
  return {
    data,
    error: null,
    loading: false,
    refreshing: true,
    stale: true,
    consistency,
    staleReason: null,
  };
}
export function staleQueryState<T>(
  data: T | null,
  reason: Exclude<QueryStaleReason, 'error'>
): QueryState<T> {
  return {
    data,
    error: null,
    loading: false,
    refreshing: false,
    stale: true,
    consistency: 'stale',
    staleReason: reason,
  };
}
export function errorQueryState<T>(data: T | null, error: {}): QueryState<T> {
  return {
    data,
    error,
    loading: false,
    refreshing: false,
    stale: true,
    consistency: 'stale',
    staleReason: 'error',
  };
}
