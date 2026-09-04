import './core.js';
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
/** Navigate the client-side router to `path` using the History API. */
declare function navigate(path: string, options?: NavigateOptions): void;
export {
  ScrollRestorationOptions,
  NavigationScrollBehavior,
  NavigateOptions,
  HistoryScrollBehavior,
  navigate,
};
