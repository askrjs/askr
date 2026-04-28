/**
 * Client-side navigation with History API
 */

import {
  resolveRoute,
  resolveRouteRequest,
  lockRouteRegistration,
  type ResolvedRoute,
} from "./route";
import { mountComponent, type ComponentInstance } from "../runtime/component";
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from "../common/env";
import { logger } from "../dev/logger";
import type { RouteRenderResult, RouteRequestResult } from "../common/router";
import { Fragment, ELEMENT_TYPE } from "../jsx";
import { DefaultPortal } from "../foundations/structures/portal";

// Global app state for navigation
let currentInstance: ComponentInstance | null = null;
let currentPathname = "/";
let currentHref = "/";

export type NavigationScrollBehavior = "top" | "preserve";
export type HistoryScrollBehavior = "restore" | "top" | "preserve";

export type ScrollRestorationOptions = {
  navigation?: NavigationScrollBehavior;
  history?: HistoryScrollBehavior;
};

type NormalizedScrollRestorationOptions = {
  enabled: boolean;
  navigation: NavigationScrollBehavior;
  history: HistoryScrollBehavior;
};

const DEFAULT_SCROLL_RESTORATION: NormalizedScrollRestorationOptions = {
  enabled: true,
  navigation: "top",
  history: "restore",
};

let scrollRestorationOptions: NormalizedScrollRestorationOptions = {
  ...DEFAULT_SCROLL_RESTORATION,
};

const scrollPositions = new Map<string, { x: number; y: number }>();

export type NavigateOptions = {
  history?: "push" | "replace";
  scroll?: NavigationScrollBehavior;
};

function getWindowHref(): string {
  if (typeof window === "undefined") {
    return currentHref;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeScrollRestorationOptions(
  options?: boolean | ScrollRestorationOptions,
): NormalizedScrollRestorationOptions {
  if (options === false) {
    return {
      enabled: false,
      navigation: DEFAULT_SCROLL_RESTORATION.navigation,
      history: DEFAULT_SCROLL_RESTORATION.history,
    };
  }

  if (options === true || options === undefined) {
    return { ...DEFAULT_SCROLL_RESTORATION };
  }

  return {
    enabled: true,
    navigation: options.navigation ?? DEFAULT_SCROLL_RESTORATION.navigation,
    history: options.history ?? DEFAULT_SCROLL_RESTORATION.history,
  };
}

function readScrollPosition(): { x: number; y: number } {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  const x =
    typeof window.scrollX === "number"
      ? window.scrollX
      : typeof window.pageXOffset === "number"
        ? window.pageXOffset
        : 0;
  const y =
    typeof window.scrollY === "number"
      ? window.scrollY
      : typeof window.pageYOffset === "number"
        ? window.pageYOffset
        : 0;

  return { x, y };
}

function writeHistoryScrollPosition(
  href: string,
  position: { x: number; y: number },
): void {
  if (typeof window === "undefined" || getWindowHref() !== href) {
    return;
  }
  if (typeof window.history?.replaceState !== "function") {
    return;
  }
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};

  window.history.replaceState(
    {
      ...state,
      path: href,
      scroll: position,
    },
    "",
    href,
  );
}

function saveScrollPosition(href: string): void {
  if (!scrollRestorationOptions.enabled || typeof window === "undefined") {
    return;
  }

  const position = readScrollPosition();
  scrollPositions.set(href, position);
  writeHistoryScrollPosition(href, position);
}

function scrollToPosition(position: { x: number; y: number }): void {
  if (typeof window === "undefined" || typeof window.scrollTo !== "function") {
    return;
  }

  window.scrollTo(position.x, position.y);
}

function applyNavigationScroll(behavior: NavigationScrollBehavior): void {
  if (!scrollRestorationOptions.enabled || behavior === "preserve") {
    return;
  }

  scrollToPosition({ x: 0, y: 0 });
}

function applyHistoryScroll(href: string, state: PopStateEvent["state"]): void {
  if (!scrollRestorationOptions.enabled) {
    return;
  }

  if (scrollRestorationOptions.history === "preserve") {
    return;
  }

  if (scrollRestorationOptions.history === "top") {
    scrollToPosition({ x: 0, y: 0 });
    return;
  }

  const fromState =
    state && typeof state === "object" && "scroll" in state
      ? (state.scroll as { x?: unknown; y?: unknown })
      : undefined;
  const saved =
    fromState &&
    typeof fromState.x === "number" &&
    typeof fromState.y === "number"
      ? { x: fromState.x, y: fromState.y }
      : scrollPositions.get(href);

  scrollToPosition(saved ?? { x: 0, y: 0 });
}

export function configureScrollRestoration(
  options?: boolean | ScrollRestorationOptions,
): void {
  scrollRestorationOptions = normalizeScrollRestorationOptions(options);

  if (typeof window === "undefined") {
    return;
  }

  if ("scrollRestoration" in window.history) {
    try {
      window.history.scrollRestoration = scrollRestorationOptions.enabled
        ? "manual"
        : "auto";
    } catch {
      // Ignore environments that expose but do not allow setting scrollRestoration.
    }
  }
}

function parseTargetUrl(path: string): URL {
  const pathname = window.location.pathname || "/";
  const search = window.location.search || "";
  const hash = window.location.hash || "";
  const href =
    typeof window.location.href === "string" ? window.location.href : "";
  const base =
    href &&
    href !== "about:blank" &&
    !href.startsWith("about:") &&
    !href.startsWith("data:")
      ? href
      : `http://localhost${pathname}${search}${hash}`;

  return new URL(path, base);
}

function isRenderResult(
  result: RouteRequestResult,
): result is RouteRenderResult {
  return result !== null && result.kind === "render";
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value instanceof Promise;
}

function createDeniedResolvedRoute(status: number): ResolvedRoute {
  return {
    handler: () => ({
      type: "div",
      props: {
        "data-route-denied": String(status),
      },
      children: [String(status)],
    }),
    params: {},
  };
}

function bindResolvedRouteHandler(
  resolved: ResolvedRoute,
): ComponentInstance["fn"] {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentInstance["fn"]>;
}

function wrapRootRouteHandler(
  componentFn: ComponentInstance["fn"],
): ComponentInstance["fn"] {
  const wrappedFn: ComponentInstance["fn"] = (props, ctx) => {
    const out = componentFn(props, ctx);
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: DefaultPortal,
      props: {},
      key: "__default_portal",
    } as unknown;

    return {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as ReturnType<ComponentInstance["fn"]>;
  };

  Object.defineProperty(wrappedFn, "name", {
    value: componentFn.name || "Component",
  });

  return wrappedFn;
}

function remountResolvedRoute(
  resolved: ResolvedRoute,
  pathname: string,
  href: string,
): boolean {
  if (!currentInstance) {
    return false;
  }

  // The route handler IS the component function
  // It takes params as props and renders the route
  currentInstance.fn = wrapRootRouteHandler(bindResolvedRouteHandler(resolved));
  currentInstance.props = {};

  // Reset state to prevent leakage from previous route
  // Each route navigation starts completely fresh
  currentInstance.stateValues = [];
  currentInstance.expectedStateIndices = [];
  currentInstance.firstRenderComplete = false;
  currentInstance.stateIndexCheck = -1;
  // Increment generation to invalidate pending async evaluations from previous route
  currentInstance.evaluationGeneration++;
  currentInstance.notifyUpdate = null;
  currentInstance.mountOperations = [];
  currentInstance._placeholder = undefined;
  currentInstance.hasPendingUpdate = false;

  // Route-local async work should create a fresh abort controller lazily.
  currentInstance.abortController = null;

  // Re-execute component against the existing host so reconciliation can
  // preserve any shared layout DOM between sibling routes.
  mountComponent(currentInstance);
  currentPathname = pathname;
  currentHref = href;
  return true;
}

function rerenderResolvedRoute(pathname: string, href: string): boolean {
  if (!currentInstance) {
    return false;
  }

  const resolved = resolveRoute(pathname);
  if (!resolved) {
    return false;
  }

  currentPathname = pathname;
  currentHref = href;
  currentInstance._enqueueRun?.();
  return true;
}

function resolveNavigationTarget(path: string) {
  const target = parseTargetUrl(path);
  const pathname = target.pathname;
  const href = `${target.pathname}${target.search}${target.hash}`;
  const resolved = resolveRouteRequest(href);

  if (isPromise(resolved)) {
    return resolved.then((next) => ({
      href,
      pathname,
      resolved: next,
    }));
  }

  return {
    href,
    pathname,
    resolved,
  };
}

function applyNavigationTarget(
  path: string,
  options: NavigateOptions,
  target: {
    href: string;
    pathname: string;
    resolved: RouteRequestResult;
  },
): void {
  const { href, pathname, resolved } = target;
  const previousPathname = currentPathname;

  saveScrollPosition(currentHref);

  if (!resolved) {
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  if (resolved.kind === "redirect") {
    const redirectTarget = parseTargetUrl(resolved.to);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    if (redirectHref === href) {
      if (isDevelopmentEnvironment()) {
        logger.warn(
          `Navigation guard redirected to the same path: ${redirectHref}`,
        );
      }
      return;
    }

    navigate(redirectHref, { history: "replace" });
    return;
  }

  const nextResolved =
    resolved.kind === "deny"
      ? createDeniedResolvedRoute(resolved.status)
      : {
          handler: resolved.handler,
          params: resolved.params,
        };

  const historyMethod =
    options.history === "replace" ? "replaceState" : "pushState";
  window.history[historyMethod]({ path: href }, "", href);

  if (currentInstance) {
    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname, href);
      return;
    }

    remountResolvedRoute(nextResolved, pathname, href);
    if (pathname !== previousPathname) {
      applyNavigationScroll(
        options.scroll ?? scrollRestorationOptions.navigation,
      );
    }
  }
}

/** Register the current app instance (called by createSPA/hydrateSPA). */
export function registerAppInstance(
  instance: ComponentInstance,
  path: string,
): void {
  currentInstance = instance;
  currentPathname = path;
  currentHref = getWindowHref();
  saveScrollPosition(currentHref);
  // Lock further route registrations after the app has started — but allow tests to register routes.
  // Enforce only in production to avoid breaking test infra which registers routes dynamically.
  if (isProductionEnvironment()) {
    lockRouteRegistration();
  }
}

/**
 * Navigate to a new path
 * Updates URL, resolves route, and re-mounts app with new handler
 */
export function navigate(path: string, options: NavigateOptions = {}): void {
  if (typeof window === "undefined") {
    // SSR context
    return;
  }

  const target = resolveNavigationTarget(path);
  if (isPromise(target)) {
    void target.then((resolvedTarget) =>
      applyNavigationTarget(path, options, resolvedTarget),
    );
    return;
  }

  applyNavigationTarget(path, options, target);
}

/**
 * Handle browser back/forward buttons
 */
function handlePopState(_event: PopStateEvent): void {
  const previousHref = currentHref;
  const pathname = window.location.pathname;
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  saveScrollPosition(previousHref);

  if (!currentInstance) {
    return;
  }

  const resolved = resolveRouteRequest(href);

  const applyResolved = (resolved: RouteRequestResult) => {
    if (!resolved) {
      if (isDevelopmentEnvironment()) {
        logger.warn(`No route found for path: ${pathname}`);
      }
      return;
    }

    if (resolved.kind === "redirect") {
      navigate(resolved.to, { history: "replace" });
      return;
    }

    if (pathname === currentPathname && isRenderResult(resolved)) {
      rerenderResolvedRoute(pathname, href);
      return;
    }

    remountResolvedRoute(
      resolved.kind === "deny"
        ? createDeniedResolvedRoute(resolved.status)
        : {
            handler: resolved.handler,
            params: resolved.params,
          },
      pathname,
      href,
    );

    applyHistoryScroll(href, _event.state);
  };

  if (isPromise(resolved)) {
    void resolved.then((next) => applyResolved(next));
    return;
  }

  applyResolved(resolved);
}

/**
 * Setup popstate listener for browser navigation
 */
export function initializeNavigation(): void {
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", handlePopState);
  }
}

/**
 * Cleanup navigation listeners
 */
export function cleanupNavigation(): void {
  if (typeof window !== "undefined") {
    window.removeEventListener("popstate", handlePopState);
  }
}
