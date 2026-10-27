import { RouteSnapshot, RouteParams, RouteSearch } from './core.js';
/** Options for {@link onRouteChange}. */
interface RouteChangeOptions {
  immediate?: boolean;
}
/** Optional cleanup returned by an {@link onRouteChange} callback, run before the next change. */
type RouteChangeCleanup = void | (() => void);
/** Register a callback to run whenever the active route changes, with optional cleanup. */
declare function onRouteChange(
  fn: (
    current: RouteSnapshot,
    previous: RouteSnapshot | null
  ) => RouteChangeCleanup,
  options?: RouteChangeOptions
): void;
/** Read the currently active route's {@link RouteSnapshot}; reactive during component render. */
declare function currentRoute<
  TParams extends RouteParams = RouteParams,
  TState = unknown,
  TAppMeta = unknown,
  TSearch = RouteSearch,
>(): RouteSnapshot<TParams, TState, TAppMeta, TSearch>;
export { onRouteChange, RouteChangeOptions, currentRoute, RouteChangeCleanup };
