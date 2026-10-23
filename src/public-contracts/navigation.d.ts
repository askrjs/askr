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
  /**
   * Throw a `TypeError` for any target on another origin, including an
   * explicit `http:`/`https:` URL, which `navigate()` otherwise hands to the
   * browser. Use it when the target came from untrusted input.
   */
  sameOrigin?: boolean;
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
/** What the router is doing about navigation right now; see {@link navigationState}. */
interface NavigationState {
  /** A navigation is waiting on route resolution (auth, policies, lazy chunk, loaders). */
  readonly pending: boolean;
  /** The public href being navigated to while \`pending\`; otherwise \`null\`. */
  readonly to: string | null;
  /** Cached route data is being refreshed in the background. */
  readonly revalidating: boolean;
}
/**
 * Read whether a navigation is pending and whether route data is being
 * revalidated. Reactive when called while rendering a client component; the
 * returned object is replaced, never mutated, when the state changes. On the
 * server it always reports idle.
 */
declare function navigationState(): NavigationState;
/**
 * Ask before the router leaves the current page. \`shouldBlock\` is evaluated
 * when an in-app navigation (\`navigate()\`, \`<Link>\`) or a back/forward
 * traversal is attempted, and when the document is about to unload. Return
 * \`true\` to refuse, a string to ask the visitor to confirm with that message,
 * or \`false\` to allow. Returns a function that removes the blocker.
 *
 * Limitations: \`updateRouteQuery()\` and redirects are not blocked; a traversal
 * is undone with \`history.go()\` after the browser has moved, so it needs a
 * known history position and flashes the destination URL; browsers show their
 * own fixed text on unload, not the string.
 */
declare function blockNavigation(
  shouldBlock: () => boolean | string
): () => void;
export {
  NavigationState,
  navigationState,
  blockNavigation,
  ScrollRestorationOptions,
  NavigationScrollBehavior,
  NavigateOptions,
  HistoryScrollBehavior,
  navigate,
};
