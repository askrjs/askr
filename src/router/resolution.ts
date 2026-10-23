import type { AuthContext, AuthDecision } from '@askrjs/auth';
import type {
  AccessDecision,
  RouteAuthOptions,
  RouteDestination,
  RouteContext,
  RouteMetaContext,
  RouteHandler,
  RoutePolicy,
  RouteRecord,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
} from '../common/router';
import { isPromiseLike } from '../common/promise';
import { getActiveRenderContext } from '../common/render-context';
import { replacePageRoute } from '../common/page-render-envelope';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';
import { createQueryPrefetchContext } from '../data/query-registry';
import type { DataRuntime } from '../data/types';
import { buildRouteContext, buildRouteContextBase } from './route-context';
import { getRenderHandler } from './rendering';
import { getMatchingRouteRecord } from './route-matching';
import { getActiveRouteAuthOptions } from './store';
import { setCurrentAuth, unresolvedAuth } from './auth';
import { _preloadRouteRecord } from './lazy';
import {
  prepareRouteHydrationData,
  ROUTE_HYDRATION_METADATA,
  withoutRouteHydrationMetadata,
  type PreparedRouteHydrationData,
} from './route-hydration';
import { withPageFramework } from '../common/page-render-envelope';
import {
  checkAccessDecision,
  exposeRedirectDecision,
  redirectDecision,
} from './policy';
import { formatNavigationUrl, resolveNavigationUrl } from '../common/url';
import { normalizeRouteBasePath, removeRouteBasePath } from './base-path';
import { getSessionAuthState } from './session-auth-state';
import { RouteDataLoadError } from './route-data-loader';
import {
  createRouteErrorHandler,
  markDeniedRoute,
  markRouteErrorResult,
  routeErrorComponent,
  routeForbiddenComponent,
} from './route-error';
import { loadDocument } from './document-navigation';

export { resolveRoute } from './route-matching';

function isAbortLikeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

const routeRenderContexts = new WeakMap<object, RouteContext>();
const routeRenderData = new WeakMap<object, unknown>();

export function getRouteRenderContext(
  result: RouteRenderResult
): RouteContext | undefined {
  return routeRenderContexts.get(result);
}

/**
 * Make the identity a client navigation resolved the browser's current one.
 * Called by the navigation commit boundary and at initial mount, so a
 * pending, failed or superseded navigation never changes what the rendered
 * page reads from `currentAuth()`.
 */
export function publishResolvedAuth(result: RouteRequestResult): void {
  if (!result || result.kind !== 'render') return;
  const context = routeRenderContexts.get(result);
  if (context?.auth) setCurrentAuth(context.auth, 'spa');
}

/** The context metadata sources receive: the route context plus loader data. */
export function getRouteMetaContext(
  result: RouteRenderResult
): RouteMetaContext | undefined {
  const context = routeRenderContexts.get(result);
  if (!context) return undefined;
  return routeRenderData.has(result)
    ? { ...context, data: routeRenderData.get(result) }
    : context;
}

export function getRouteRenderData(result: RouteRenderResult): unknown {
  return routeRenderData.get(result);
}

/** Router-owned inspection of the record selected by request resolution. */
export function resolvedRouteHasLoader(result: RouteRenderResult): boolean {
  return typeof result.record?.options?.loader === 'function';
}

function createRouteRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  handler: RouteHandler
): RouteRenderResult {
  const result: RouteRenderResult = { kind: 'render', handler, params };
  Object.defineProperty(result, 'record', {
    value: record,
    enumerable: false,
  });
  routeRenderContexts.set(result, context);
  return result;
}

function getDefaultRouteMode(): RouteContext['mode'] {
  return typeof window !== 'undefined' ? 'spa' : 'ssr';
}

function withoutInitialRouteHydrationMetadata(
  envelope: ReturnType<typeof replacePageRoute>
) {
  return withPageFramework(
    envelope,
    withoutRouteHydrationMetadata(envelope.framework) ?? {}
  );
}

/** @internal Bind resolved loader output to one route subtree and its hydration envelope. */
export function bindResolvedRouteData(
  handler: RouteHandler,
  data: unknown,
  hydration?: PreparedRouteHydrationData
): RouteHandler {
  return (params, context) => {
    const renderContext = getActiveRenderContext();
    if (renderContext) {
      const envelope = replacePageRoute(renderContext.renderData, data);
      renderContext.renderData = hydration
        ? envelope
        : withoutInitialRouteHydrationMetadata(envelope);
      const hydrationEnvelope = replacePageRoute(
        renderContext.hydrationData,
        hydration?.data ?? data
      );
      renderContext.hydrationData = hydration
        ? withPageFramework(hydrationEnvelope, {
            ...hydrationEnvelope.framework,
            [ROUTE_HYDRATION_METADATA]: hydration.metadata,
          })
        : withoutInitialRouteHydrationMetadata(hydrationEnvelope);
    }
    return handler(params, context);
  };
}

export function hasRouteRenderData(result: RouteRenderResult): boolean {
  return routeRenderData.has(result);
}

function buildRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  request: Request | undefined,
  telemetry: CoreTelemetry | undefined,
  load: boolean,
  dataRuntime: DataRuntime | undefined,
  assertCurrent?: () => void
): RouteRequestResult | Promise<RouteRequestResult> {
  assertCurrent?.();
  const renderHandler = getRenderHandler(record);
  const loader =
    context.mode !== 'ssg' && load ? record.options?.loader : undefined;
  const preload = record.options?.preload;
  const active = getActiveRenderContext();
  const prefetch =
    active?.queryPrefetch ??
    createQueryPrefetchContext({
      mode: context.mode === 'ssg' ? 'ssr' : context.mode,
      request,
      signal: context.signal,
      runtime: (active?.dataRuntime as DataRuntime | undefined) ?? dataRuntime,
      telemetry,
    });
  // The lazy chunk, preload and loader are independent: start them together
  // so the slowest decides latency instead of their sum.
  const pending: Array<PromiseLike<unknown>> = [];
  const lazyImport = _preloadRouteRecord(record);
  if (lazyImport) pending.push(lazyImport);
  if (preload) {
    pending.push(
      new Promise<unknown>((resolve) =>
        resolve(preload({ ...context, params, request, data: prefetch }))
      )
    );
  }
  let loaded: unknown;
  if (loader) {
    try {
      loaded = withTelemetry(telemetry?.loader, { route: record.path }, () =>
        loader({ ...context, params, request })
      );
    } catch (error) {
      if (pending.length === 0) throw error;
      loaded = Promise.reject(error);
    }
    if (isPromiseLike(loaded)) pending.push(loaded);
  }
  const finalize = (data: unknown): RouteRenderResult => {
    assertCurrent?.();
    if (!loader) {
      return createRouteRenderResult(record, params, context, renderHandler);
    }
    const hydration =
      context.mode === 'ssr'
        ? prepareRouteHydrationData(
            data,
            record.options?.dehydrate,
            { ...context, params, request },
            context.href || context.pathname || record.path
          )
        : undefined;
    const result = createRouteRenderResult(
      record,
      params,
      context,
      bindResolvedRouteData(renderHandler, data, hydration)
    );
    routeRenderData.set(result, data);
    return result;
  };
  if (pending.length === 0) return finalize(loaded);
  const data = isPromiseLike(loaded) ? loaded : Promise.resolve(loaded);
  return Promise.all([data, ...pending]).then(([value]) => finalize(value));
}

function runPolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  request: Request | undefined,
  telemetry: CoreTelemetry | undefined,
  load: boolean,
  dataRuntime: DataRuntime | undefined,
  assertCurrent: (() => void) | undefined,
  start = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = start; index < policies.length; index += 1) {
    assertCurrent?.();
    const result = policies[index](context);
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((decision) =>
        decision.kind === 'allow'
          ? runPolicies(
              policies,
              context,
              record,
              params,
              request,
              telemetry,
              load,
              dataRuntime,
              assertCurrent,
              index + 1
            )
          : checkAccessDecision(decision)
      );
    }
    if (result.kind !== 'allow') return checkAccessDecision(result);
  }
  return buildRenderResult(
    record,
    params,
    context,
    request,
    telemetry,
    load,
    dataRuntime,
    assertCurrent
  );
}

type PathTarget = string | RouteDestination;
type PathSetting =
  | PathTarget
  | ((context: RouteContext) => PathTarget | PromiseLike<PathTarget>);

function resolvePath(
  value: PathSetting | undefined,
  fallback: string,
  context: RouteContext
) {
  return typeof value === 'function' ? value(context) : (value ?? fallback);
}

function appendNext(path: string, href: string): string {
  const target = resolveNavigationUrl(path);
  target.searchParams.set('next', href);
  return formatNavigationUrl(target);
}

function mapAuthDecision(
  decision: AuthDecision,
  context: RouteContext,
  options: RouteAuthOptions | undefined
): AccessDecision | Promise<AccessDecision> {
  if (decision.allowed) return { kind: 'allow' };
  if (decision.reason === 'forbidden') return { kind: 'deny', status: 403 };
  const setting =
    decision.reason === 'unauthenticated'
      ? options?.loginPath
      : options?.authenticatedRedirectTo;
  const target = resolvePath(
    setting,
    decision.reason === 'unauthenticated' ? '/login' : '/',
    context
  );
  const finalize = (path: PathTarget): AccessDecision =>
    redirectDecision(
      path,
      {
        replace:
          decision.reason === 'unauthenticated' ? context.mode === 'spa' : true,
      },
      (href) =>
        decision.reason === 'unauthenticated'
          ? appendNext(href, context.href)
          : href
    );
  return isPromiseLike(target)
    ? Promise.resolve(target).then(finalize)
    : finalize(target);
}

function resolveMatchedRoute(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  authOptions: RouteAuthOptions | undefined,
  request: Request | undefined,
  telemetry: CoreTelemetry | undefined,
  load: boolean,
  dataRuntime: DataRuntime | undefined,
  assertCurrent?: () => void
): RouteRequestResult | Promise<RouteRequestResult> {
  const continueResolution = (decision?: AuthDecision) => {
    assertCurrent?.();
    if (decision) {
      const access = mapAuthDecision(decision, context, authOptions);
      if (isPromiseLike(access)) {
        return Promise.resolve(access).then((next) =>
          next.kind === 'allow'
            ? runPolicies(
                record.options.policies ?? [],
                context,
                record,
                params,
                request,
                telemetry,
                load,
                dataRuntime,
                assertCurrent
              )
            : next
        );
      }
      if (access.kind !== 'allow') return access;
    }
    return runPolicies(
      record.options.policies ?? [],
      context,
      record,
      params,
      request,
      telemetry,
      load,
      dataRuntime,
      assertCurrent
    );
  };
  if (!record.options.auth) return continueResolution();
  const decision = record.options.auth(context.auth);
  return isPromiseLike(decision)
    ? Promise.resolve(decision).then(continueResolution)
    : continueResolution(decision);
}

/**
 * Callers may omit `signal`, and `RouteRequestOptions.signal` is optional in the
 * published contract. Route context still needs an `AbortSignal`, so this stands
 * in for "this caller supplied no cancellation". It never aborts: a route loader
 * receiving it cannot be cancelled through `context.signal`. Prefer passing a
 * real signal.
 */
const NEVER_ABORTED: AbortSignal = new AbortController().signal;

/** Resolve `target` against a route registry, applying auth/policies to produce a render/redirect/deny result. */
export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveRouteRequestInternal(target, options);
}

/** @internal Navigation retains the exact app owner through deferred resolution. */
export function resolveOwnedRouteRequest(
  target: string,
  options: RouteRequestOptions,
  assertCurrent: () => void
): RouteRequestResult | Promise<RouteRequestResult> {
  return resolveRouteRequestInternal(target, options, assertCurrent);
}

function resolveRouteRequestInternal(
  target: string,
  options: RouteRequestOptions,
  assertCurrent?: () => void
): RouteRequestResult | Promise<RouteRequestResult> {
  if (!options?.registry) {
    throw new TypeError('resolveRouteRequest requires options.registry.');
  }
  const basePath = normalizeRouteBasePath(options.registry.manifest.basePath);
  const logicalTarget = removeRouteBasePath(target, basePath);
  if (logicalTarget === undefined) return null;
  return withTelemetry(options.telemetry?.routeMatch, {}, () => {
    const records = options.registry.manifest.records;
    const match = getMatchingRouteRecord(logicalTarget, records);
    if (!match) return null;
    assertCurrent?.();
    const mode = options.mode ?? getDefaultRouteMode();
    const signal =
      options.signal ?? getActiveRenderContext()?.signal ?? NEVER_ABORTED;
    const authOptions = getActiveRouteAuthOptions(
      options.auth ?? options.registry.manifest.auth
    );
    const base = buildRouteContextBase(logicalTarget, match.params, {
      mode,
      signal,
    });
    const exposeRedirect = (result: RouteRequestResult): RouteRequestResult =>
      result?.kind === 'redirect'
        ? exposeRedirectDecision(result, basePath)
        : result;
    const finalize = (authContext: AuthContext) => {
      assertCurrent?.();
      // A server or hydration render owns its identity at once. A browser
      // navigation publishes it when it commits (see publishResolvedAuth),
      // so a page still on screen keeps the identity it rendered with.
      if (!signal.aborted && (mode !== 'spa' || getActiveRenderContext())) {
        setCurrentAuth(authContext, mode);
      }
      const result = resolveMatchedRoute(
        match.record,
        match.params,
        buildRouteContext(logicalTarget, match.params, {
          mode,
          signal,
          authContext,
        }),
        authOptions,
        options.request,
        options.telemetry,
        options.load !== false,
        options.dataRuntime,
        assertCurrent
      );
      const marked = markDenial(result);
      if (!basePath) return marked;
      return isPromiseLike(marked)
        ? Promise.resolve(marked).then(exposeRedirect)
        : exposeRedirect(marked);
    };
    const markDenial = (
      result: RouteRequestResult | Promise<RouteRequestResult>
    ): RouteRequestResult | Promise<RouteRequestResult> => {
      // Only a route with a forbidden component needs the marking hop.
      if (!routeForbiddenComponent(match.record)) return result;
      const mark = (next: RouteRequestResult): RouteRequestResult => {
        if (next?.kind !== 'deny' || !routeForbiddenComponent(match.record)) {
          return next;
        }
        // A copy: the decision a policy returned may be shared.
        const denied = { ...next };
        markDeniedRoute(denied, match.record);
        return denied;
      };
      return isPromiseLike(result)
        ? Promise.resolve(result).then(mark)
        : mark(result);
    };
    const showError = (error: unknown): RouteRequestResult => {
      if (
        !options.routeErrors ||
        signal.aborted ||
        isAbortLikeError(error) ||
        !routeErrorComponent(match.record)
      ) {
        throw error;
      }
      assertCurrent?.();
      const handler = createRouteErrorHandler(match.record, error)!;
      const result = createRouteRenderResult(
        match.record,
        match.params,
        buildRouteContext(logicalTarget, match.params, {
          mode,
          signal,
          authContext: options.authContext ?? unresolvedAuth(mode),
        }),
        handler
      );
      markRouteErrorResult(result);
      return result;
    };
    const recover = (error: unknown): RouteRequestResult => {
      assertCurrent?.();
      if (mode !== 'spa' || signal.aborted) throw error;
      const state = getSessionAuthState(authOptions);
      const recovery = state?.recover(
        error instanceof RouteDataLoadError ? error.cause : error,
        targetHref()
      );
      if (!recovery) return showError(error);
      if (recovery.document) {
        if (!state!.hasMountedRoots())
          loadDocument(
            new URL(recovery.href, window.location.href).href,
            'replace'
          );
        return null;
      }
      return { kind: 'redirect', to: recovery.href, replace: true };
    };
    const targetHref = () => {
      const url = resolveNavigationUrl(
        target,
        typeof window === 'undefined' ? undefined : window.location.href
      );
      return `${url.pathname}${url.search}${url.hash}`;
    };
    try {
      const result = options.authContext
        ? finalize(options.authContext)
        : !authOptions?.resolve
          ? finalize(unresolvedAuth(mode))
          : (() => {
              const resolved = authOptions.resolve(base);
              return isPromiseLike(resolved)
                ? Promise.resolve(resolved).then(finalize)
                : finalize(resolved);
            })();
      return mode === 'spa' &&
        (getSessionAuthState(authOptions) ||
          (options.routeErrors && routeErrorComponent(match.record))) &&
        isPromiseLike(result)
        ? Promise.resolve(result).catch(recover)
        : result;
    } catch (error) {
      return recover(error);
    }
  });
}
