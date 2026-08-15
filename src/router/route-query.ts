import { saveScrollPosition } from './navigation-scroll';
import {
  getCurrentHref,
  getRegisteredAppsSnapshot,
  getWindowHref,
  parseTargetUrl,
  setCurrentRouteLocation,
  syncAppRegistrationLocation,
  syncRegisteredRouteSnapshot,
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

  const url = parseTargetUrl(getWindowHref());
  applyRouteQueryUpdates(url.searchParams, updates);

  const href = `${url.pathname}${url.search}${url.hash}`;
  if (href === getWindowHref()) {
    return;
  }

  const historyMode = getRouteQueryHistoryMode(options);
  if (historyMode === 'push') {
    saveScrollPosition(getCurrentHref());
  }

  const state =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};

  window.history[historyMode === 'replace' ? 'replaceState' : 'pushState'](
    {
      ...state,
      path: href,
    },
    '',
    href
  );

  setCurrentRouteLocation(url.pathname, href);
  for (const app of getRegisteredAppsSnapshot()) {
    syncAppRegistrationLocation(app, url.pathname, href);
  }
  syncRegisteredRouteSnapshot();
}
