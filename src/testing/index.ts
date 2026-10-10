/** Stable testing surface over focused fixtures and interaction helpers. */
export { cleanup, dispatch, flush, render, renderRoute } from './render';
export type { RenderOptions, RenderResult, RouteRenderOptions } from './render';
export * from './interactions';
export * from './registries';
export * from './mutation-fixtures';
export { mockQuery } from './query-fixtures';
export type { MockQueryOptions, MockRefresh } from './query-fixtures';
export * from './invalidation';
export { getRouteWarnings } from './routes';
export type { RoutePatternWarning } from './routes';
