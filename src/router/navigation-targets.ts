import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import type {
  RouteMeta,
  RouteRenderResult,
  RouteRequestResult,
} from '../common/router';
import {
  clearRegisteredDefaultPortalForInstance,
  getDefaultPortalHost,
} from '../common/default-portal-runtime';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import { CspNonceScope } from '../csp-nonce';
import { logger } from '../common/logger';
import {
  cleanupComponent,
  beginLifecycleCommitBatch,
  discardLifecycleCommitBatch,
  drainLifecycleCommitErrors,
  flushLifecycleCommitBatch,
  flushRuntimeScheduler,
  executeComponent,
  cleanupComponentGeneration,
  cleanupReadableSubscriptionSources,
  adjustOwnershipDiagnostic,
  trackRouteGeneration,
  type ReadableSource,
  type ComponentInstance,
} from '../runtime';
import { teardownNodeSubtree } from '../renderer/cleanup';
import {
  applyHistoryScroll,
  applyNavigationScroll,
  saveScrollPosition,
  type NavigationScrollBehavior,
} from './navigation-scroll';
import {
  getCurrentHref,
  getCurrentPathname,
  getRegisteredAppsSnapshot,
  parseTargetUrl,
  setCurrentRouteLocation,
  syncAppRegistrationLocation,
  syncRegisteredRouteSnapshot,
  type AppRegistration,
} from './navigation-registry';
import { resolveRouteRequest, type ResolvedRoute } from './route';
import {
  getRouteRenderContext,
  getRouteRenderData,
  hasRouteRenderData,
} from './resolution';
import { withoutRouteHydrationMetadata } from './route-hydration';
import { reconcileRouteMeta, resolveRouteMeta } from './metadata';
import {
  clearStagedAppRenderRouteLocation,
  createAppRenderRuntime,
  stageAppRenderRouteLocation,
} from '../common/app-render-runtime';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** Options for {@link navigate}. */
export type NavigateOptions = {
  history?: 'push' | 'replace';
  replace?: boolean;
  scroll?: NavigationScrollBehavior;
};

export type NavigationRedirectState = {
  redirects: number;
  visited: Set<string>;
};

export type AppNavigationTarget = {
  app: AppRegistration;
  resolved: RouteRequestResult;
  metadata?: Readonly<RouteMeta>;
};

const MAX_NAVIGATION_REDIRECTS = 20;

let activeRouteRequestId = 0;
let activeRouteRequestController: AbortController | null = null;

export function beginRouteRequest(): { id: number; signal: AbortSignal } {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = new AbortController();

  return {
    id: activeRouteRequestId,
    signal: activeRouteRequestController.signal,
  };
}

export function isStaleRouteRequest(requestId: number): boolean {
  return requestId !== activeRouteRequestId;
}

export function cancelRouteRequests(): void {
  activeRouteRequestId += 1;
  activeRouteRequestController?.abort();
  activeRouteRequestController = null;
}

function isRenderResult(
  result: RouteRequestResult
): result is RouteRenderResult {
  return result !== null && result.kind === 'render';
}

function createNavigationTarget(
  app: AppRegistration,
  resolved: RouteRequestResult
): AppNavigationTarget | Promise<AppNavigationTarget> {
  if (!isRenderResult(resolved) || !resolved.record) return { app, resolved };
  const hasMetadata = Boolean(
    resolved.record.options.title ||
    resolved.record.options.meta ||
    resolved.record.metaChain?.length
  );
  if (!hasMetadata) return { app, resolved };
  const context = getRouteRenderContext(resolved);
  if (!context) return { app, resolved };
  return resolveRouteMeta(resolved.record, context).then((metadata) => ({
    app,
    resolved,
    metadata,
  }));
}

function reconcileNavigationMetadata(
  targets: readonly AppNavigationTarget[]
): void {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const metadata = targets[index]?.metadata;
    if (metadata) {
      reconcileRouteMeta(metadata);
      return;
    }
  }
}

export function getRedirectHistoryMode(
  replace: boolean | undefined
): 'push' | 'replace' {
  return replace === false ? 'push' : 'replace';
}

function getNavigationHistoryMode(
  options: NavigateOptions
): 'push' | 'replace' {
  if (options.history) {
    return options.history;
  }

  return options.replace ? 'replace' : 'push';
}

function createDeniedResolvedRoute(status: number): ResolvedRoute {
  return {
    handler: () => ({
      type: 'div',
      props: {
        'data-route-denied': String(status),
      },
      children: [String(status)],
    }),
    params: {},
  };
}

function bindResolvedRouteHandler(
  resolved: ResolvedRoute
): ComponentInstance['fn'] {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentInstance['fn']>;
}

function wrapRootRouteHandler(
  componentFn: ComponentInstance['fn'],
  cspNonce?: string
): ComponentInstance['fn'] {
  const wrappedFn: ComponentInstance['fn'] = (props, ctx) => {
    const out = componentFn(props, ctx);
    if (isPromiseLike(out)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: getDefaultPortalHost(),
      props: { __askrAutoDefaultPortal: true },
      key: '__default_portal',
    } as unknown;

    const root = {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as ReturnType<ComponentInstance['fn']>;
    return cspNonce === undefined
      ? root
      : CspNonceScope({ value: cspNonce, children: root });
  };

  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'Component',
  });

  return wrappedFn;
}

function flattenLifecycleErrors(error: unknown, result: unknown[]): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      flattenLifecycleErrors(nested, result);
    }
    return;
  }

  result.push(error);
}

function reportRouteCleanupErrors(errors: unknown[]): void {
  for (const error of errors) {
    const flattened: unknown[] = [];
    flattenLifecycleErrors(error, flattened);
    for (const cleanupError of flattened.length > 0 ? flattened : [error]) {
      logger.error('[Askr] route cleanup failed:', cleanupError);
    }
  }
}

type DeferredRouteCleanup = {
  instance: ComponentInstance;
  previousOwnershipGeneration: object;
  previousFn: ComponentInstance['fn'];
  previousProps: ComponentInstance['props'];
  previousExpectedStateIndices: ComponentInstance['expectedStateIndices'];
  previousFirstRenderComplete: boolean;
  previousStateIndexCheck: number;
  previousErrorBoundaryState: ComponentInstance['errorBoundaryState'];
  previousTarget: ComponentInstance['target'];
  previousDom: RouteDomSnapshot | null;
  previousStateValues: ComponentInstance['stateValues'];
  previousCleanupFns: ComponentInstance['cleanupFns'];
  previousOwnedChildScopes: ComponentInstance['_ownedChildScopes'];
  previousAbortController: AbortController | null;
  previousMountOperations: ComponentInstance['mountOperations'];
  previousCommitOperations: ComponentInstance['commitOperations'];
  previousLifecycleSlots: ComponentInstance['lifecycleSlots'];
  previousLifecycleGeneration: number;
  previousEvaluationGeneration: number;
  previousHasPendingUpdate: boolean;
  previousNotifyUpdate: ComponentInstance['notifyUpdate'];
  previousPlaceholder: ComponentInstance['_placeholder'];
  previousMounted: boolean;
  previousCurrentRenderToken: ComponentInstance['_currentRenderToken'];
  previousLastRenderToken: ComponentInstance['lastRenderToken'];
  previousPendingReadSources: ComponentInstance['_pendingReadSources'];
  previousPendingReadSourceVersions: ComponentInstance['_pendingReadSourceVersions'];
  previousLastReadSources: ComponentInstance['_lastReadSources'];
  previousReaderEntries: Array<{
    source: ReadableSource<unknown>;
    reader: { token: number; generation: object } | undefined;
  }>;
  previousAppRenderRuntime: ComponentInstance['_appRenderRuntime'];
  previousInstances: ComponentInstance[];
  previousDisposed: boolean;
};

type RouteDomNodeSnapshot = {
  node: Node;
  children: Node[];
  attributes: Array<[string, string]> | null;
  nodeValue: string | null;
};

type RouteDomSnapshot = {
  root: Element;
  nodes: RouteDomNodeSnapshot[];
};

function captureRouteDom(root: Element | null): RouteDomSnapshot | null {
  if (!root) {
    return null;
  }

  const nodes: RouteDomNodeSnapshot[] = [];
  const visit = (node: Node): void => {
    nodes.push({
      node,
      children: Array.from(node.childNodes),
      attributes:
        node instanceof Element
          ? Array.from(node.attributes).map((attribute) => [
              attribute.name,
              attribute.value,
            ])
          : null,
      nodeValue: node.nodeValue,
    });

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };

  visit(root);
  return { root, nodes };
}

function collectProvisionalRouteNodes(snapshot: RouteDomSnapshot): Node[] {
  const originalNodes = new Set(snapshot.nodes.map((entry) => entry.node));
  const provisional: Node[] = [];
  const visit = (node: Node): void => {
    if (!originalNodes.has(node)) {
      provisional.push(node);
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };

  for (const child of Array.from(snapshot.root.childNodes)) {
    visit(child);
  }

  return provisional;
}

function restoreRouteDom(snapshot: RouteDomSnapshot | null): unknown[] {
  if (!snapshot) {
    return [];
  }

  const errors: unknown[] = [];
  for (const node of collectProvisionalRouteNodes(snapshot)) {
    try {
      teardownNodeSubtree(node, { strict: true });
    } catch (error) {
      errors.push(error);
    }
  }

  for (const entry of snapshot.nodes) {
    const { node, attributes } = entry;
    try {
      if (attributes && node instanceof Element) {
        const expected = new Map(attributes);
        for (const attribute of Array.from(node.attributes)) {
          if (!expected.has(attribute.name)) {
            node.removeAttribute(attribute.name);
          }
        }
        for (const [name, value] of attributes) {
          if (node.getAttribute(name) !== value) {
            node.setAttribute(name, value);
          }
        }
      } else if (!(node instanceof Element)) {
        node.nodeValue = entry.nodeValue;
      }

      if (node instanceof Element || node instanceof DocumentFragment) {
        node.replaceChildren(...entry.children);
      }
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

function collectHostInstances(root: Element): ComponentInstance[] {
  const instances: ComponentInstance[] = [];
  const seen = new Set<ComponentInstance>();
  const pending: Node[] = [root];

  while (pending.length > 0) {
    const node = pending.pop()!;
    const host = node as Node & {
      __ASKR_INSTANCE?: ComponentInstance;
      __ASKR_INSTANCES?: ComponentInstance[];
    };
    for (const instance of host.__ASKR_INSTANCES ?? []) {
      if (!seen.has(instance)) {
        seen.add(instance);
        instances.push(instance);
      }
    }
    if (host.__ASKR_INSTANCE && !seen.has(host.__ASKR_INSTANCE)) {
      seen.add(host.__ASKR_INSTANCE);
      instances.push(host.__ASKR_INSTANCE);
    }

    for (let child = node.lastChild; child; child = child.previousSibling) {
      pending.push(child);
    }
  }

  return instances;
}

function captureDeferredRouteCleanup(
  instance: ComponentInstance
): DeferredRouteCleanup {
  return {
    instance,
    previousOwnershipGeneration: instance._ownershipGeneration,
    previousFn: instance.fn,
    previousProps: instance.props,
    previousExpectedStateIndices: instance.expectedStateIndices,
    previousFirstRenderComplete: instance.firstRenderComplete,
    previousStateIndexCheck: instance.stateIndexCheck,
    previousErrorBoundaryState: instance.errorBoundaryState,
    previousTarget: instance.target,
    previousDom: captureRouteDom(instance.target),
    previousStateValues: instance.stateValues,
    previousCleanupFns: instance.cleanupFns,
    previousOwnedChildScopes: instance._ownedChildScopes,
    previousAbortController: instance.abortController,
    previousMountOperations: instance.mountOperations,
    previousCommitOperations: instance.commitOperations,
    previousLifecycleSlots: instance.lifecycleSlots,
    previousLifecycleGeneration: instance.lifecycleGeneration,
    previousEvaluationGeneration: instance.evaluationGeneration,
    previousHasPendingUpdate: instance.hasPendingUpdate,
    previousNotifyUpdate: instance.notifyUpdate,
    previousPlaceholder: instance._placeholder,
    previousMounted: instance.mounted,
    previousCurrentRenderToken: instance._currentRenderToken,
    previousLastRenderToken: instance.lastRenderToken,
    previousPendingReadSources: instance._pendingReadSources,
    previousPendingReadSourceVersions: instance._pendingReadSourceVersions,
    previousLastReadSources: instance._lastReadSources,
    previousReaderEntries: Array.from(instance._lastReadSources ?? []).map(
      (source) => ({
        source,
        reader: source._readers?.get(instance),
      })
    ),
    previousAppRenderRuntime: instance._appRenderRuntime,
    previousInstances: instance.target
      ? collectHostInstances(instance.target)
      : [],
    previousDisposed: false,
  };
}

function restoreDeferredRouteInstance(
  deferred: DeferredRouteCleanup
): unknown[] {
  const instance = deferred.instance;
  const errors: unknown[] = [];
  const activeGeneration = instance._ownershipGeneration;
  const activeReadSources = instance._lastReadSources;

  if (activeGeneration !== deferred.previousOwnershipGeneration) {
    try {
      cleanupReadableSubscriptionSources(
        instance,
        activeReadSources,
        activeGeneration
      );
    } catch (error) {
      errors.push(error);
    }
    instance._lastReadSources = undefined;
    try {
      cleanupComponent(instance);
    } catch (error) {
      errors.push(error);
    }
  }

  errors.push(...restoreRouteDom(deferred.previousDom));

  instance.fn = deferred.previousFn;
  instance._ownershipGeneration = deferred.previousOwnershipGeneration;
  instance.props = deferred.previousProps;
  instance.expectedStateIndices = deferred.previousExpectedStateIndices;
  instance.firstRenderComplete = deferred.previousFirstRenderComplete;
  instance.stateIndexCheck = deferred.previousStateIndexCheck;
  instance.errorBoundaryState = deferred.previousErrorBoundaryState;
  instance.target = deferred.previousTarget;
  instance.stateValues = deferred.previousStateValues;
  instance.cleanupFns = deferred.previousCleanupFns;
  instance._ownedChildScopes = deferred.previousOwnedChildScopes;
  instance.abortController = deferred.previousAbortController;
  instance.mountOperations = deferred.previousMountOperations;
  instance.commitOperations = deferred.previousCommitOperations;
  instance.lifecycleSlots = deferred.previousLifecycleSlots;
  instance.lifecycleGeneration = deferred.previousLifecycleGeneration;
  instance.evaluationGeneration = deferred.previousEvaluationGeneration;
  instance.hasPendingUpdate = deferred.previousHasPendingUpdate;
  instance.notifyUpdate = deferred.previousNotifyUpdate;
  instance._placeholder = deferred.previousPlaceholder;
  instance.mounted = deferred.previousMounted;
  instance._currentRenderToken = deferred.previousCurrentRenderToken;
  instance.lastRenderToken = deferred.previousLastRenderToken;
  instance._pendingReadSources = deferred.previousPendingReadSources;
  instance._pendingReadSourceVersions =
    deferred.previousPendingReadSourceVersions;
  instance._lastReadSources = deferred.previousLastReadSources;
  instance._appRenderRuntime = deferred.previousAppRenderRuntime;

  const previousSources = new Set(
    deferred.previousReaderEntries.map(({ source }) => source)
  );
  for (const source of activeReadSources ?? []) {
    if (previousSources.has(source)) {
      continue;
    }

    const reader = source._readers?.get(instance);
    if (reader?.generation === activeGeneration) {
      if (source._readers?.delete(instance) && __ASKR_DEVELOPMENT_BUILD__) {
        adjustOwnershipDiagnostic('readableReaders', -1);
      }
    }
  }
  for (const { source, reader } of deferred.previousReaderEntries) {
    if (!reader) {
      if (source._readers?.delete(instance) && __ASKR_DEVELOPMENT_BUILD__) {
        adjustOwnershipDiagnostic('readableReaders', -1);
      }
      continue;
    }

    let readers = source._readers;
    if (!readers) {
      readers = new Map();
      source._readers = readers;
    }
    const hadReader = readers.has(instance);
    readers.set(instance, reader);
    if (!hadReader && __ASKR_DEVELOPMENT_BUILD__) {
      adjustOwnershipDiagnostic('readableReaders', 1);
    }
  }

  return errors;
}

function restoreDeferredRouteInstances(
  deferredCleanups: DeferredRouteCleanup[]
): void {
  const errors: unknown[] = [];
  for (let index = deferredCleanups.length - 1; index >= 0; index -= 1) {
    errors.push(...restoreDeferredRouteInstance(deferredCleanups[index]!));
  }

  if (errors.length > 0) {
    reportRouteCleanupErrors(errors);
  }
}

function cleanupDeferredRouteInstance(
  deferred: DeferredRouteCleanup
): unknown[] {
  const errors: unknown[] = [];
  const instance = deferred.instance;
  if (!deferred.previousDisposed) {
    deferred.previousDisposed = true;
    try {
      cleanupComponentGeneration(instance, {
        ownershipGeneration: deferred.previousOwnershipGeneration,
        cleanupFns: deferred.previousCleanupFns,
        ownedChildScopes: deferred.previousOwnedChildScopes,
        abortController: deferred.previousAbortController,
        readSources: deferred.previousLastReadSources,
      });
    } catch (error) {
      errors.push(error);
    }
  }

  const root = instance.target;
  const liveInstances = root ? new Set(collectHostInstances(root)) : new Set();
  for (let index = deferred.previousInstances.length - 1; index >= 0; index--) {
    const previous = deferred.previousInstances[index]!;
    if (previous === instance || liveInstances.has(previous)) {
      continue;
    }

    try {
      cleanupComponent(previous);
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

function remountResolvedRoute(
  instance: ComponentInstance,
  resolved: ResolvedRoute,
  pathname: string,
  href: string,
  existingSnapshot?: DeferredRouteCleanup
): DeferredRouteCleanup {
  // Keep the live root and its retained wrapper chain in place while the new
  // route is evaluated. The renderer can then match shared layout owners and
  // intrinsic roots against the incoming tree instead of forcing navigation
  // through a cloned root. Removed descendants are cleaned up by the normal
  // renderer commit path, after the new tree has been accepted.
  const deferredCleanup =
    existingSnapshot ?? captureDeferredRouteCleanup(instance);
  clearRegisteredDefaultPortalForInstance(instance);
  instance.fn = wrapRootRouteHandler(
    bindResolvedRouteHandler(resolved),
    instance._cspNonce
  );
  instance.props = {};
  instance._ownershipGeneration = {};
  if (__ASKR_DEVELOPMENT_BUILD__) {
    trackRouteGeneration(instance._ownershipGeneration);
  }

  instance.stateValues = [];
  instance.expectedStateIndices = [];
  instance.firstRenderComplete = false;
  instance.stateIndexCheck = -1;
  instance.evaluationGeneration++;
  instance.lifecycleGeneration++;
  instance.notifyUpdate = null;
  instance.mountOperations = [];
  instance.commitOperations = [];
  instance.lifecycleSlots = [];
  instance.cleanupFns = [];
  instance._ownedChildScopes = new Set();
  instance._placeholder = undefined;
  instance.hasPendingUpdate = false;
  instance._currentRenderToken = undefined;
  instance.lastRenderToken = 0;
  instance._pendingReadSources = undefined;
  instance._lastReadSources = undefined;

  instance.abortController = null;

  executeComponent(instance);
  setCurrentRouteLocation(pathname, href);
  return deferredCleanup;
}

function rerenderResolvedRoute(
  instance: ComponentInstance,
  pathname: string,
  href: string
): boolean {
  setCurrentRouteLocation(pathname, href);
  instance._enqueueRun?.();
  return true;
}

function resolveAppRouteRequest(
  app: AppRegistration,
  pathname: string,
  href: string,
  signal: AbortSignal
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveRouteRequest(href, {
    registry: app.registry,
    auth: app.auth,
    signal,
  });
}

function getResolvedRouteHandler(resolved: RouteRequestResult): ResolvedRoute {
  if (!resolved) {
    throw new Error('[Askr] cannot prepare an unmatched navigation target');
  }
  if (resolved.kind === 'deny') {
    return createDeniedResolvedRoute(resolved.status);
  }
  if (!isRenderResult(resolved)) {
    throw new Error('[Askr] cannot prepare a redirect as a destination root');
  }
  return {
    handler: resolved.handler,
    params: resolved.params,
  };
}

function updateRouteRuntime(
  instance: ComponentInstance,
  resolved: RouteRequestResult,
  href: string
): void {
  const current = instance._appRenderRuntime;
  const runtime = createAppRenderRuntime({
    framework: withoutRouteHydrationMetadata(current?.framework),
    dataRuntime: current?.dataRuntime,
    routeRegistry: current?.routeRegistry,
    routeAuth: current?.routeAuth,
    route:
      resolved?.kind === 'render' ? getRouteRenderData(resolved) : undefined,
    hasRoute: resolved?.kind === 'render' && hasRouteRenderData(resolved),
  });
  stageAppRenderRouteLocation(runtime, href);
  instance._appRenderRuntime = runtime;
}

function clearStagedRouteLocations(
  targets: readonly AppNavigationTarget[]
): void {
  for (const target of targets) {
    clearStagedAppRenderRouteLocation(target.app.instance._appRenderRuntime);
  }
}

export function resolveNavigationTargetsForApps(
  pathname: string,
  href: string,
  signal: AbortSignal
): AppNavigationTarget[] | Promise<AppNavigationTarget[]> {
  const apps = getRegisteredAppsSnapshot();

  if (apps.length === 1) {
    const app = apps[0]!;
    const resolved = resolveAppRouteRequest(app, pathname, href, signal);
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      return Promise.resolve(resolved).then((next) => {
        const target = createNavigationTarget(app, next);
        return isPromiseLike(target)
          ? Promise.resolve(target).then((ready) => [ready])
          : [target];
      });
    }
    const target = createNavigationTarget(app, resolved);
    return isPromiseLike(target)
      ? Promise.resolve(target).then((next) => [next])
      : [target];
  }

  const syncTargets: AppNavigationTarget[] = [];
  const pendingTargets: Array<Promise<AppNavigationTarget>> = [];

  for (const app of apps) {
    const resolved = resolveAppRouteRequest(app, pathname, href, signal);
    if (isPromiseLike<RouteRequestResult>(resolved)) {
      pendingTargets.push(
        Promise.resolve(resolved).then((next) =>
          createNavigationTarget(app, next)
        )
      );
      continue;
    }
    const target = createNavigationTarget(app, resolved);
    if (isPromiseLike(target)) pendingTargets.push(Promise.resolve(target));
    else syncTargets.push(target);
  }

  if (pendingTargets.length === 0) {
    return syncTargets;
  }

  return Promise.all([
    ...syncTargets.map((target) => Promise.resolve(target)),
    ...pendingTargets,
  ]);
}

export function applyNavigationTargets(
  requestId: number,
  path: string,
  options: NavigateOptions,
  redirectState: NavigationRedirectState,
  pathname: string,
  href: string,
  targets: AppNavigationTarget[],
  navigateWithRedirectState: (
    path: string,
    options: NavigateOptions,
    redirectState: NavigationRedirectState
  ) => void
): void {
  if (isStaleRouteRequest(requestId)) {
    return;
  }
  const previousPathname = getCurrentPathname();
  const previousHref = getCurrentHref();

  for (const target of targets) {
    const resolved = target.resolved;
    if (!resolved || resolved.kind !== 'redirect') {
      continue;
    }

    const redirectTarget = parseTargetUrl(resolved.to);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    if (redirectHref === href) {
      if (isDevelopmentEnvironment()) {
        logger.warn(
          `Navigation guard redirected to the same path: ${redirectHref}`
        );
      }
      return;
    }

    if (redirectState.visited.has(redirectHref)) {
      throw new Error(
        `[Askr] Navigation redirect cycle detected at ${redirectHref}.`
      );
    }
    if (redirectState.redirects >= MAX_NAVIGATION_REDIRECTS) {
      throw new Error(
        `[Askr] Navigation redirect limit exceeded (${MAX_NAVIGATION_REDIRECTS}).`
      );
    }

    redirectState.visited.add(redirectHref);
    redirectState.redirects++;
    navigateWithRedirectState(
      redirectHref,
      {
        history: getRedirectHistoryMode(resolved.replace),
      },
      redirectState
    );
    return;
  }

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${path}`);
    }
    return;
  }

  if (isStaleRouteRequest(requestId)) {
    return;
  }

  const samePathTargets: AppNavigationTarget[] = [];
  const rootsToPrepare: AppNavigationTarget[] = [];
  for (const target of matchedTargets) {
    const resolved = target.resolved!;
    if (resolved.kind === 'redirect') {
      continue;
    }

    if (pathname === target.app.pathname && isRenderResult(resolved)) {
      samePathTargets.push(target);
      continue;
    }
    rootsToPrepare.push(target);
  }

  const rollbackSnapshots = matchedTargets.map((target) =>
    captureDeferredRouteCleanup(target.app.instance)
  );
  const rollbackSnapshotByInstance = new Map(
    rollbackSnapshots.map((snapshot) => [snapshot.instance, snapshot])
  );
  const deferredCleanups: DeferredRouteCleanup[] = [];
  const cleanupErrors: unknown[] = [];
  const previousAppLocations = matchedTargets.map((target) => ({
    app: target.app,
    pathname: target.app.pathname,
    href: target.app.href,
  }));
  const restoreOnExit = (): void => {
    if (!navigationBatchClosed) {
      discardLifecycleCommitBatch(navigationBatch);
      navigationBatchClosed = true;
    }
    restoreDeferredRouteInstances(rollbackSnapshots);
    for (const previous of previousAppLocations) {
      previous.app.pathname = previous.pathname;
      previous.app.href = previous.href;
    }
    setCurrentRouteLocation(previousPathname, previousHref);
  };
  const navigationBatch = beginLifecycleCommitBatch();
  let navigationBatchClosed = false;
  try {
    for (const target of rootsToPrepare) {
      if (isStaleRouteRequest(requestId)) {
        restoreOnExit();
        return;
      }
      updateRouteRuntime(target.app.instance, target.resolved, href);
      const deferredCleanup = remountResolvedRoute(
        target.app.instance,
        getResolvedRouteHandler(target.resolved),
        pathname,
        href,
        rollbackSnapshotByInstance.get(target.app.instance)
      );
      deferredCleanups.push(deferredCleanup);
    }

    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }

    // Route roots remain live during the renderer transaction so retained
    // layout elements keep their identity. Publication below is still held
    // until every root has rendered successfully.
    flushRuntimeScheduler();
    cleanupErrors.push(...drainLifecycleCommitErrors());
    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }

    for (const target of samePathTargets) {
      if (isStaleRouteRequest(requestId)) {
        restoreOnExit();
        return;
      }
      updateRouteRuntime(target.app.instance, target.resolved, href);
      rerenderResolvedRoute(target.app.instance, pathname, href);
    }

    flushRuntimeScheduler();
    cleanupErrors.push(...drainLifecycleCommitErrors());

    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }

    flushLifecycleCommitBatch(navigationBatch);
    navigationBatchClosed = true;
    cleanupErrors.push(...drainLifecycleCommitErrors());

    for (const target of matchedTargets) {
      if (target.resolved && target.resolved.kind !== 'redirect') {
        syncAppRegistrationLocation(target.app, pathname, href);
      }
    }

    if (isStaleRouteRequest(requestId)) {
      // A nested navigation may have committed a newer destination while the
      // lifecycle batch was flushing. Never roll that destination back.
      return;
    }

    saveScrollPosition(previousHref);
    const historyMethod =
      getNavigationHistoryMode(options) === 'replace'
        ? 'replaceState'
        : 'pushState';
    window.history[historyMethod]({ path: href }, '', href);
    setCurrentRouteLocation(pathname, href);
    clearStagedRouteLocations(matchedTargets);
    syncRegisteredRouteSnapshot();
    reconcileNavigationMetadata(matchedTargets);

    if (pathname !== previousPathname || parseTargetUrl(href).hash) {
      applyNavigationScroll(options.scroll);
    }

    for (const deferredCleanup of deferredCleanups) {
      cleanupErrors.push(...cleanupDeferredRouteInstance(deferredCleanup));
    }

    for (const error of cleanupErrors) {
      reportRouteCleanupErrors([error]);
    }
  } catch (error) {
    restoreOnExit();
    logger.error('[Askr] navigation failed:', error);
    throw error;
  } finally {
    // Route loader state is owned by each resolved handler's lexical scope.
  }
}

export function applyPopStateNavigationTargets(
  requestId: number,
  previousHref: string,
  previousState: unknown,
  pathname: string,
  href: string,
  state: unknown,
  targets: AppNavigationTarget[],
  navigate: (path: string, options: NavigateOptions) => void
): void {
  if (isStaleRouteRequest(requestId)) {
    return;
  }

  const matchedTargets = targets.filter((target) => target.resolved !== null);
  if (matchedTargets.length === 0) {
    if (isDevelopmentEnvironment()) {
      logger.warn(`No route found for path: ${pathname}`);
    }
    return;
  }

  for (const target of matchedTargets) {
    const resolved = target.resolved!;
    if (resolved.kind !== 'redirect') {
      continue;
    }

    navigate(resolved.to, {
      history: getRedirectHistoryMode(resolved.replace),
    });
    return;
  }

  const samePathTargets: AppNavigationTarget[] = [];
  const rootsToPrepare: AppNavigationTarget[] = [];
  for (const target of matchedTargets) {
    const resolved = target.resolved!;
    if (pathname === target.app.pathname && isRenderResult(resolved)) {
      samePathTargets.push(target);
      continue;
    }

    if (resolved.kind === 'redirect') {
      continue;
    }

    rootsToPrepare.push(target);
  }

  const previousPathname = getCurrentPathname();
  saveScrollPosition(previousHref);
  const rollbackSnapshots = matchedTargets.map((target) =>
    captureDeferredRouteCleanup(target.app.instance)
  );
  const rollbackSnapshotByInstance = new Map(
    rollbackSnapshots.map((snapshot) => [snapshot.instance, snapshot])
  );
  const deferredCleanups: DeferredRouteCleanup[] = [];
  const cleanupErrors: unknown[] = [];
  const previousAppLocations = matchedTargets.map((target) => ({
    app: target.app,
    pathname: target.app.pathname,
    href: target.app.href,
  }));
  const restoreOnExit = (): void => {
    if (!navigationBatchClosed) {
      discardLifecycleCommitBatch(navigationBatch);
      navigationBatchClosed = true;
    }
    restoreDeferredRouteInstances(rollbackSnapshots);
    for (const previous of previousAppLocations) {
      previous.app.pathname = previous.pathname;
      previous.app.href = previous.href;
    }
    setCurrentRouteLocation(previousPathname, previousHref);
  };
  const navigationBatch = beginLifecycleCommitBatch();
  let navigationBatchClosed = false;
  try {
    for (const target of rootsToPrepare) {
      if (isStaleRouteRequest(requestId)) {
        restoreOnExit();
        return;
      }
      updateRouteRuntime(target.app.instance, target.resolved, href);
      const deferredCleanup = remountResolvedRoute(
        target.app.instance,
        getResolvedRouteHandler(target.resolved),
        pathname,
        href,
        rollbackSnapshotByInstance.get(target.app.instance)
      );
      deferredCleanups.push(deferredCleanup);
    }
    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }
    flushRuntimeScheduler();
    cleanupErrors.push(...drainLifecycleCommitErrors());
    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }

    for (const target of samePathTargets) {
      if (isStaleRouteRequest(requestId)) {
        restoreOnExit();
        return;
      }
      updateRouteRuntime(target.app.instance, target.resolved, href);
      rerenderResolvedRoute(target.app.instance, pathname, href);
    }
    flushRuntimeScheduler();
    cleanupErrors.push(...drainLifecycleCommitErrors());
    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }

    flushLifecycleCommitBatch(navigationBatch);
    navigationBatchClosed = true;
    cleanupErrors.push(...drainLifecycleCommitErrors());

    for (const target of matchedTargets) {
      if (target.resolved && target.resolved.kind !== 'redirect') {
        syncAppRegistrationLocation(target.app, pathname, href);
      }
    }
    if (isStaleRouteRequest(requestId)) {
      restoreOnExit();
      return;
    }
    setCurrentRouteLocation(pathname, href);
    clearStagedRouteLocations(matchedTargets);
    syncRegisteredRouteSnapshot();
    reconcileNavigationMetadata(matchedTargets);
    applyHistoryScroll(href, state);
    for (const deferredCleanup of deferredCleanups) {
      cleanupErrors.push(...cleanupDeferredRouteInstance(deferredCleanup));
    }
    for (const error of cleanupErrors) {
      reportRouteCleanupErrors([error]);
    }
  } catch (error) {
    restoreOnExit();
    try {
      window.history.replaceState(previousState, '', previousHref);
      syncRegisteredRouteSnapshot();
    } catch (rollbackError) {
      logger.error(
        '[Askr] failed to restore URL after popstate failure:',
        rollbackError
      );
    }
    throw error;
  } finally {
    // Route loader state is owned by each resolved handler's lexical scope.
  }
}
