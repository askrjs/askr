import type {
  ParsedSegment,
  RouteComponent,
  RouteOptions,
} from '../common/router';
import type { AuthDecision, AuthRequirement } from '@askrjs/auth';
import type { InternalRouteRecord } from './internal-types';
import { computeRank, parseSegments, routeMatchKey } from './match';
import { compileNodePolicies } from './access';
import { createRouteHandler } from './rendering';
import { joinRoutePaths, validateRoutePath } from './path-policy';
import { resolveIndexPath } from './registration-scope';
import {
  addRouteToStores,
  assertRouteRegistrationUnlocked,
  getCurrentInheritedAuthRequirements,
  getCurrentInheritedMeta,
  getCurrentInheritedPolicies,
  getCurrentLayoutChain,
  getCurrentPageChain,
  getCurrentPageScope,
  getCurrentPathPrefix,
  getCurrentScopeKind,
  getRouteRecords,
  hasActivePageScope,
  insertRecordSorted,
} from './store';

function normalizeRouteOptions(
  options: RouteOptions | undefined
): RouteOptions | undefined {
  if (!options) {
    return undefined;
  }

  const loader = options.loader;
  const dehydrate = options.dehydrate;
  const preload = options.preload;
  const policies = compileNodePolicies(options);

  if (
    !loader &&
    !dehydrate &&
    !preload &&
    !options.entries &&
    !options.invalidationKeys &&
    policies.length === 0 &&
    !options.title &&
    !options.namespace &&
    !options.search &&
    !options.meta &&
    !options.actions &&
    options.auth === undefined
  ) {
    return undefined;
  }

  return {
    ...(loader ? { loader } : {}),
    ...(dehydrate ? { dehydrate } : {}),
    ...(preload ? { preload } : {}),
    ...(options.entries ? { entries: options.entries } : {}),
    ...(options.invalidationKeys
      ? { invalidationKeys: options.invalidationKeys }
      : {}),
    ...(options.auth !== undefined ? { auth: options.auth } : {}),
    ...(policies.length > 0 ? { policies } : {}),
    ...(options.title ? { title: options.title } : {}),
    ...(options.namespace ? { namespace: options.namespace } : {}),
    ...(options.search ? { search: options.search } : {}),
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.actions ? { actions: options.actions } : {}),
  };
}

function assertRouteNotDuplicated(
  path: string,
  segments: ParsedSegment[],
  fallbackPrefix: string | undefined
): void {
  const key = routeMatchKey(segments, fallbackPrefix);
  const existing = getRouteRecords().find(
    (record) => routeMatchKey(record.segments, record.fallbackPrefix) === key
  );
  if (existing) {
    const hint =
      existing.path === path
        ? " To generate several pages from one route template, declare it once and return each page's params from entries()."
        : '';
    throw new Error(
      `Duplicate route path "${path}": it matches the same URLs as "${existing.path}", which is already registered.${hint}`
    );
  }
}

const authAllowed: AuthDecision = Object.freeze({ allowed: true });

// Inherited and route requirements must all allow, evaluated in declaration
// order; the first denial wins. Kept local so @askrjs/auth stays type-only.
function requireAll(requirements: AuthRequirement[]): AuthRequirement {
  return async (context) => {
    for (const requirement of requirements) {
      const decision = await requirement(context);
      if (!decision.allowed) return decision;
    }
    return authAllowed;
  };
}

export function registerRouteAtResolvedPath(
  path: string,
  Component: RouteComponent,
  options?: RouteOptions,
  metadata?: {
    isFallback?: boolean;
    fallbackPrefix?: string;
  }
): void {
  assertRouteRegistrationUnlocked();
  if (typeof Component !== 'function') {
    throw new Error('Route registration requires a component function.');
  }
  validateRoutePath(path);

  const segments = parseSegments(path);
  assertRouteNotDuplicated(path, segments, metadata?.fallbackPrefix);

  const chain = getCurrentLayoutChain();
  const pageChain = getCurrentPageChain();
  const rank = computeRank(segments);
  const isFallback = metadata?.isFallback ?? path === '/*';
  const comp = Component;
  const normalizedOptions = normalizeRouteOptions(options);
  const policies = [
    ...getCurrentInheritedPolicies(),
    ...(normalizedOptions?.policies ?? []),
  ];
  const authRequirements = [
    ...getCurrentInheritedAuthRequirements(),
    ...(normalizedOptions?.auth ? [normalizedOptions.auth] : []),
  ];
  const auth: AuthRequirement | undefined =
    authRequirements.length === 0
      ? undefined
      : authRequirements.length === 1
        ? authRequirements[0]
        : requireAll(authRequirements);
  const metaChain = [
    ...getCurrentInheritedMeta(),
    ...(normalizedOptions?.meta ? [normalizedOptions.meta] : []),
  ];

  const handler = createRouteHandler(comp, pageChain, chain);
  const renderHandler = createRouteHandler(comp, pageChain, chain, true);

  const record: InternalRouteRecord = {
    path,
    component: comp,
    segments,
    rank,
    layoutChain: chain,
    pageChain,
    options: normalizedOptions
      ? {
          ...normalizedOptions,
          ...(auth ? { auth } : {}),
          ...(policies.length > 0 ? { policies } : {}),
        }
      : policies.length > 0
        ? { policies, ...(auth ? { auth } : {}) }
        : auth
          ? { auth }
          : {},
    ...(metaChain.length > 0 ? { metaChain } : {}),
    isFallback,
    handler,
    renderHandler,
    ...(metadata?.fallbackPrefix
      ? { fallbackPrefix: metadata.fallbackPrefix }
      : {}),
  };

  insertRecordSorted(record);
  addRouteToStores({
    path,
    handler,
    namespace: normalizedOptions?.namespace ?? options?.namespace,
    ...(metadata?.fallbackPrefix
      ? { fallbackPrefix: metadata.fallbackPrefix }
      : {}),
  });
}

/** Declare the index route for the enclosing `page()` scope. */
export function registerIndexRoute(
  Component: RouteComponent,
  options?: RouteOptions
): void {
  const pageScope = getCurrentPageScope();
  if (pageScope?.hasIndex) {
    throw new Error('page() cannot declare multiple index routes.');
  }

  registerRouteAtResolvedPath(resolveIndexPath(), Component, options);
  if (pageScope) {
    pageScope.hasIndex = true;
  }
}

/** Declare the catch-all `/*` fallback route for the enclosing scope. */
export function registerFallbackRoute(Component: RouteComponent): void {
  if (hasActivePageScope()) {
    if (getCurrentScopeKind() !== 'page') {
      throw new Error(
        'fallback() inside page() must be declared directly in the page scope, not inside nested group().'
      );
    }

    registerRouteAtResolvedPath(
      joinRoutePaths(getCurrentPathPrefix(), '*'),
      Component,
      undefined,
      { isFallback: true, fallbackPrefix: getCurrentPathPrefix() }
    );
    return;
  }

  const allowsRootFallback =
    getCurrentInheritedPolicies().length === 0 &&
    getCurrentInheritedAuthRequirements().length === 0;

  if (!allowsRootFallback) {
    throw new Error(
      'fallback() can only be registered at the root scope. ' +
        'Use route("/*", Component) if you need compatibility behavior.'
    );
  }

  registerRouteAtResolvedPath('/*', Component, undefined, {
    isFallback: true,
    fallbackPrefix: '/',
  });
}
