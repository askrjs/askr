import type { AuthContext, AuthDecision } from '@askrjs/auth';
import type {
  AccessDecision,
  RouteAuthOptions,
  RouteContext,
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
import { buildRouteContext, buildRouteContextBase } from './route-context';
import { getRenderHandler } from './rendering';
import { getMatchingRouteRecord } from './route-matching';
import { getActiveRouteAuthOptions } from './store';
import { setCurrentAuth } from './auth';
import { _preloadRouteRecord } from './lazy';
import {
  prepareRouteHydrationData,
  ROUTE_HYDRATION_METADATA,
  withoutRouteHydrationMetadata,
  type PreparedRouteHydrationData,
} from './route-hydration';
import { withPageFramework } from '../common/page-render-envelope';
import {
  addRouteBasePath,
  normalizeRouteBasePath,
  removeRouteBasePath,
} from './base-path';

export { resolveRoute } from './route-matching';

const anonymous = (): AuthContext => ({
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
});

const routeRenderContexts = new WeakMap<object, RouteContext>();
const routeRenderData = new WeakMap<object, unknown>();

export function getRouteRenderContext(
  result: RouteRenderResult
): RouteContext | undefined {
  return routeRenderContexts.get(result);
}

export function getRouteRenderData(result: RouteRenderResult): unknown {
  return routeRenderData.get(result);
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
  load: boolean
): RouteRequestResult | Promise<RouteRequestResult> {
  const lazyImport = _preloadRouteRecord(record);
  if (lazyImport) {
    return lazyImport.then(() =>
      buildLoadedRenderResult(record, params, context, request, telemetry, load)
    );
  }
  return buildLoadedRenderResult(
    record,
    params,
    context,
    request,
    telemetry,
    load
  );
}

function buildLoadedRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  request: Request | undefined,
  telemetry: CoreTelemetry | undefined,
  load: boolean
): RouteRequestResult | Promise<RouteRequestResult> {
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
      runtime: active?.dataRuntime as
        | import('../data/types').DataRuntime
        | undefined,
      telemetry,
    });
  const runPreload = preload
    ? Promise.resolve(
        preload({ ...context, params, request, data: prefetch })
      ).then(() => undefined)
    : undefined;
  if (loader) {
    const load = () =>
      withTelemetry(telemetry?.loader, { route: record.path }, () =>
        loader({ ...context, params, request })
      );
    const loaded = runPreload ? runPreload.then(load) : load();
    const finalize = (data: unknown): RouteRenderResult => {
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
    return isPromiseLike(loaded)
      ? Promise.resolve(loaded).then(finalize)
      : finalize(loaded);
  }
  if (runPreload) {
    return runPreload.then(() =>
      createRouteRenderResult(record, params, context, renderHandler)
    );
  }
  return createRouteRenderResult(record, params, context, renderHandler);
}

function runPolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  request: Request | undefined,
  telemetry: CoreTelemetry | undefined,
  load: boolean,
  start = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = start; index < policies.length; index += 1) {
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
              index + 1
            )
          : decision
      );
    }
    if (result.kind !== 'allow') return result;
  }
  return buildRenderResult(record, params, context, request, telemetry, load);
}

type PathSetting =
  | string
  | ((context: RouteContext) => string | PromiseLike<string>);

function resolvePath(
  value: PathSetting | undefined,
  fallback: string,
  context: RouteContext
) {
  return typeof value === 'function' ? value(context) : (value ?? fallback);
}

function appendNext(path: string, href: string): string {
  const target = new URL(path, 'http://localhost');
  target.searchParams.set('next', href);
  return `${target.pathname}${target.search}${target.hash}`;
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
  const finalize = (path: string): AccessDecision => ({
    kind: 'redirect',
    to:
      decision.reason === 'unauthenticated'
        ? appendNext(path, context.href)
        : path,
    replace:
      decision.reason === 'unauthenticated' ? context.mode === 'spa' : true,
  });
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
  load: boolean
): RouteRequestResult | Promise<RouteRequestResult> {
  const continueResolution = (decision?: AuthDecision) => {
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
                load
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
      load
    );
  };
  if (!record.options.auth) return continueResolution();
  const decision = record.options.auth(context.auth);
  return isPromiseLike(decision)
    ? Promise.resolve(decision).then(continueResolution)
    : continueResolution(decision);
}

export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions
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
    const mode = options.mode ?? getDefaultRouteMode();
    const signal =
      options.signal ??
      getActiveRenderContext()?.signal ??
      new AbortController().signal;
    const authOptions = getActiveRouteAuthOptions(
      options.auth ?? options.registry.manifest.auth
    );
    const base = buildRouteContextBase(logicalTarget, match.params, {
      mode,
      signal,
    });
    const exposeRedirect = (result: RouteRequestResult): RouteRequestResult =>
      result?.kind === 'redirect'
        ? {
            ...result,
            to: addRouteBasePath(result.to, basePath),
          }
        : result;
    const finalize = (authContext: AuthContext) => {
      setCurrentAuth(authContext);
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
        options.load !== false
      );
      if (!basePath) return result;
      return isPromiseLike(result)
        ? Promise.resolve(result).then(exposeRedirect)
        : exposeRedirect(result);
    };
    if (options.authContext) return finalize(options.authContext);
    if (!authOptions?.resolve) return finalize(anonymous());
    const resolved = authOptions.resolve(base);
    return isPromiseLike(resolved)
      ? Promise.resolve(resolved).then(finalize)
      : finalize(resolved);
  });
}
