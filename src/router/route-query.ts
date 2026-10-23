import { saveScrollPosition } from './navigation-scroll';
import { commitHistoryIndex, nextHistoryIndex } from './history-index';
import {
  getCurrentHref,
  getRegisteredAppsSnapshot,
  getWindowHref,
  parseTargetUrl,
  setCurrentRouteLocation,
  syncAppRegistrationLocation,
  syncRegisteredRouteSnapshot,
  toDocumentUrl,
} from './navigation-registry';

/** A single query-string value accepted by {@link updateRouteQuery}. */
export type RouteQueryParamValue = string | number | boolean | null | undefined;
/** A query-string value, or an array of them for a repeated param. */
export type RouteQueryParamInput =
  | RouteQueryParamValue
  | readonly RouteQueryParamValue[];
/** A map of query param updates for {@link updateRouteQuery}; `null`/`undefined` removes the key. */
export type RouteQueryUpdates = Record<string, RouteQueryParamInput>;
/** A function that mutates a `URLSearchParams` directly, for {@link updateRouteQuery}. */
export type RouteQueryUpdater = (searchParams: URLSearchParams) => void;

/** Options for {@link updateRouteQuery}. */
export type UpdateRouteQueryOptions = {
  /**
   * Defaults to replace so high-frequency controls such as search inputs do not
   * create one browser-history entry per character.
   */
  history?: 'push' | 'replace';
  replace?: boolean;
};

function getRouteQueryHistoryMode(
  options: UpdateRouteQueryOptions
): 'push' | 'replace' {
  if (options.history) {
    return options.history;
  }

  return options.replace === false ? 'push' : 'replace';
}

function setRouteQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: RouteQueryParamInput
): void {
  searchParams.delete(key);

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === null || entry === undefined) {
        continue;
      }
      searchParams.append(key, String(entry));
    }
    return;
  }

  if (value === null || value === undefined) {
    return;
  }

  searchParams.set(key, String(value));
}

function applyRouteQueryUpdates(
  searchParams: URLSearchParams,
  updates: RouteQueryUpdates | RouteQueryUpdater
): void {
  if (typeof updates === 'function') {
    updates(searchParams);
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    setRouteQueryValue(searchParams, key, value);
  }
}

export function updateRouteQuery(
  updates: RouteQueryUpdates | RouteQueryUpdater,
  options: UpdateRouteQueryOptions = {}
): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Parse the current URL itself: its root-relative form can start with `//`
  // (a `//x` pathname), which would parse as another host. An empty relative
  // URL drops the fragment, so restore it.
  const url = parseTargetUrl('');
  url.hash = window.location.hash;
  applyRouteQueryUpdates(url.searchParams, updates);

  const href = `${url.pathname}${url.search}${url.hash}`;
  if (href === getWindowHref()) {
    return;
  }

  commitLocationOnlyNavigation(url.pathname, href, {
    historyMode: getRouteQueryHistoryMode(options),
  });
}

/**
 * Publish a new location for the page that is already rendered: a query or
 * fragment change that needs no route resolution. The history entry carries
 * the given state, or keeps the current entry's state when none is given.
 */
export function commitLocationOnlyNavigation(
  pathname: string,
  href: string,
  options: {
    historyMode: 'push' | 'replace';
    state?: { hasState: boolean; state: unknown };
  }
): void {
  const { historyMode } = options;
  if (historyMode === 'push') {
    saveScrollPosition(getCurrentHref());
  }

  const current =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
  const entryState = options.state
    ? { askrHasState: options.state.hasState, askrState: options.state.state }
    : current;

  const historyIndex = nextHistoryIndex(historyMode);
  window.history[historyMode === 'replace' ? 'replaceState' : 'pushState'](
    {
      ...entryState,
      path: href,
      askrIndex: historyIndex,
    },
    '',
    toDocumentUrl(href)
  );
  commitHistoryIndex(historyIndex);

  setCurrentRouteLocation(pathname, href);
  for (const app of getRegisteredAppsSnapshot()) {
    syncAppRegistrationLocation(app, pathname, href);
  }
  syncRegisteredRouteSnapshot();
}
