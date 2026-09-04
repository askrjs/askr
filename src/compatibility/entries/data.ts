/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../data/index';
import type * as Contract from '../contracts/data/index';
export type * from '../contracts/data/index';

const public_createDataRuntime: typeof Contract.createDataRuntime =
  implementation.createDataRuntime;
const public_createMutation: typeof Contract.createMutation =
  implementation.createMutation;
const public_createQuery: typeof Contract.createQuery =
  implementation.createQuery;
const public_createQueryCollection: typeof Contract.createQueryCollection =
  implementation.createQueryCollection;
const public_createQueryPrefetchContext: typeof Contract.createQueryPrefetchContext =
  implementation.createQueryPrefetchContext;
const public_defineQuery: typeof Contract.defineQuery =
  implementation.defineQuery;
const public_defineServerQueries: typeof Contract.defineServerQueries =
  implementation.defineServerQueries;
const public_dehydrateDataRuntime: typeof Contract.dehydrateDataRuntime =
  implementation.dehydrateDataRuntime;
const public_getDefaultDataRuntime: typeof Contract.getDefaultDataRuntime =
  implementation.getDefaultDataRuntime;
const public_hydrateDataRuntime: typeof Contract.hydrateDataRuntime =
  implementation.hydrateDataRuntime;
const public_invalidate: typeof Contract.invalidate = implementation.invalidate;
const public_invalidateOnInterval: typeof Contract.invalidateOnInterval =
  implementation.invalidateOnInterval;
const public_prefetchQuery: typeof Contract.prefetchQuery =
  implementation.prefetchQuery;
const public_queryScope: typeof Contract.queryScope = implementation.queryScope;
const public_serveQuery: typeof Contract.serveQuery = implementation.serveQuery;

export {
  public_createDataRuntime as createDataRuntime,
  public_createMutation as createMutation,
  public_createQuery as createQuery,
  public_createQueryCollection as createQueryCollection,
  public_createQueryPrefetchContext as createQueryPrefetchContext,
  public_defineQuery as defineQuery,
  public_defineServerQueries as defineServerQueries,
  public_dehydrateDataRuntime as dehydrateDataRuntime,
  public_getDefaultDataRuntime as getDefaultDataRuntime,
  public_hydrateDataRuntime as hydrateDataRuntime,
  public_invalidate as invalidate,
  public_invalidateOnInterval as invalidateOnInterval,
  public_prefetchQuery as prefetchQuery,
  public_queryScope as queryScope,
  public_serveQuery as serveQuery,
};
