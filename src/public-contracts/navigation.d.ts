import { RouteDestination } from './core.js';
/** Scroll behavior for programmatic navigations (`navigate()`). */
type NavigationScrollBehavior = 'top' | 'preserve';
/** Scroll behavior for browser back/forward (popstate) navigations. */
type HistoryScrollBehavior = 'restore' | 'top' | 'preserve';
/** Options for {@link configureScrollRestoration}. */
type ScrollRestorationOptions = {
  navigation?: NavigationScrollBehavior;
  history?: HistoryScrollBehavior;
};
/** Options for {@link navigate}. */
type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
  /** Entry-local browser history state. It is not serialized into the URL or sent to the server. */
  state?: unknown;
};
/**
 * Navigate the client-side router using the History API.
 *
 * A string is a logical path: a root-relative path gains the registry
 * `basePath`. A typed destination from `to()` already carries its public href.
 * A target on another origin is handed to the browser.
 */
declare function navigate(
  target: string | RouteDestination,
  options?: NavigateOptions
): void;
export {
  ScrollRestorationOptions,
  NavigationScrollBehavior,
  NavigateOptions,
  HistoryScrollBehavior,
  navigate,
};
