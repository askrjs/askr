import type { AuthContext } from '@askrjs/auth';
import type {
  AccessDenyDecision,
  ResolvedRoute,
  RouteAuthOptions,
  RouteHandler,
  RouteRequestResult,
  RouteRegistry,
} from '../common/router';
import { resolveRouteRequest } from '../router/route';
import { resolveOwnedRouteRequest } from '../router/resolution';
import {
  reconcileRouteMeta,
  resolveRouteMeta,
  resolveOwnedRouteMeta,
} from '../router/metadata';
import { getRouteMetaContext } from '../router/resolution';
import { readHistoryIndex } from '../router/history-index';
import { createDeniedHandler, isRouteErrorResult } from '../router/route-error';
import { loadDocument } from '../router/document-navigation';
import { reloadForStaleDeployment } from '../router/stale-deployment';
import { resolveNavigationUrl } from '../common/url';
import type { ComponentFunction } from '../common/component';
import type { DataRuntime } from '../data/types';

const MAX_INITIAL_ROUTE_REDIRECTS = 20;

export function bindResolvedRouteHandler(
  resolved: ResolvedRoute
): ComponentFunction {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentFunction>;
}

export function bindDeniedStatus(
  decision: Pick<AccessDenyDecision, 'status'>
): ComponentFunction {
  const handler = createDeniedHandler(decision);
  return () => handler({}) as ReturnType<ComponentFunction>;
}

export function bindDeniedRouteHandler(
  decision: Pick<AccessDenyDecision, 'status'>
): RouteHandler {
  return createDeniedHandler(decision);
}

export async function reconcileInitialRouteMetadata(
  resolved: RouteRequestResult,
  assertCurrent?: () => void
): Promise<void> {
  if (
    resolved?.kind !== 'render' ||
    !resolved.record ||
    isRouteErrorResult(resolved)
  )
    return;
  if (
    !resolved.record.options.title &&
    !resolved.record.options.meta &&
    !resolved.record.metaChain?.length
  )
    return;
  const context = getRouteMetaContext(resolved);
  if (!context) return;
  const metadata = await (assertCurrent
    ? resolveOwnedRouteMeta(resolved.record, context, assertCurrent)
    : resolveRouteMeta(resolved.record, context));
  assertCurrent?.();
  reconcileRouteMeta(metadata);
}

/** An initial route outcome: redirects are always followed, never returned. */
type InitialRouteResult = Exclude<RouteRequestResult, { kind: 'redirect' }>;

/**
 * Resolve the route for the current location, following redirects (and
 * replacing the history entry for each) until a render, deny, or no-match
 * result is reached. Returns `null` when a redirect leaves the origin: the
 * browser is loading that document, so there is nothing to mount.
 */
export async function resolveInitialRoute(
  auth?: RouteAuthOptions,
  source?: {
    registry: RouteRegistry;
    load?: boolean;
    authContext?: AuthContext;
    dataRuntime?: DataRuntime;
    assertCurrent?: () => void;
    signal?: AbortSignal;
  }
): Promise<{
  path: string;
  href: string;
  resolved: InitialRouteResult;
} | null> {
  let path = typeof window !== 'undefined' ? window.location.pathname : '/';
  let href =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  const visited = new Set<string>();

  for (
    let redirects = 0;
    redirects <= MAX_INITIAL_ROUTE_REDIRECTS;
    redirects++
  ) {
    if (visited.has(href)) {
      throw new Error(`[Askr] Route redirect cycle detected at ${href}.`);
    }
    visited.add(href);

    if (!source?.registry) {
      throw new TypeError('resolveInitialRoute requires a route registry.');
    }
    source.assertCurrent?.();
    const routeOptions = {
      registry: source.registry,
      auth,
      load: source.load,
      authContext: source.authContext,
      dataRuntime: source.dataRuntime,
      signal: source.signal,
      routeErrors: true,
    };
    let resolved: RouteRequestResult;
    try {
      resolved = await (source.assertCurrent
        ? resolveOwnedRouteRequest(href, routeOptions, source.assertCurrent)
        : resolveRouteRequest(href, routeOptions));
    } catch (error) {
      // Chunks the deployed page references may be gone: load a fresh document.
      if (typeof window !== 'undefined') {
        reloadForStaleDeployment(error, window.location.href, 'replace');
      }
      throw error;
    }
    source.assertCurrent?.();
    if (!resolved || resolved.kind !== 'redirect') {
      return { path, href, resolved };
    }

    const base =
      typeof window !== 'undefined'
        ? window.location.href
        : new URL(href, 'http://localhost').href;
    const redirectTarget = resolveNavigationUrl(resolved.to, base);
    if (redirectTarget.origin !== new URL(base).origin) {
      // Another origin: the router cannot render it, so the browser loads it
      // in place of this entry.
      if (typeof window !== 'undefined')
        loadDocument(redirectTarget.href, 'replace');
      return null;
    }
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        {
          path: redirectHref,
          askrIndex: readHistoryIndex(window.history.state),
        },
        '',
        redirectTarget.href
      );
    }
    path = redirectTarget.pathname;
    href = redirectHref;
  }

  throw new Error(
    `[Askr] Route redirect limit exceeded (${MAX_INITIAL_ROUTE_REDIRECTS}).`
  );
}
