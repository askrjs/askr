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
import { createQueryPrefetchContext } from '../data/query-registry';
import { buildRouteContext, buildRouteContextBase } from './route-context';
import { getRenderHandler } from './rendering';
import { getMatchingRouteRecord } from './route-matching';
import { getActiveRouteAuthOptions, getRouteRecords } from './store';

export {
  _resolveRouteMatchFromRoutes,
  computeMatchesFromRouteRecords,
  computeMatchesFromRoutes,
  computeRouteActivityMatches,
  resolveRoute,
  resolveRouteFromRoutes,
} from './route-matching';

const anonymous = (): AuthContext => ({
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
});

function getDefaultRouteMode(): RouteContext['mode'] {
  return typeof window !== 'undefined' ? 'spa' : 'ssr';
}

function createRenderDataAwareHandler(
  handler: RouteHandler,
  data: unknown
): RouteHandler {
  return (params, context) => {
    const renderContext = getActiveRenderContext();
    if (renderContext) {
      renderContext.renderData = (data ?? null) as Record<string, unknown> | null;
    }
    return handler(params, context);
  };
}

function buildRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  request: Request | undefined,
): RouteRequestResult | Promise<RouteRequestResult> {
  const renderHandler = getRenderHandler(record);
  const loader = context.mode === 'ssr' ? record.options?.loader : undefined;
  const preload = record.options?.preload;
  const active = getActiveRenderContext();
  const prefetch = active?.queryPrefetch ?? createQueryPrefetchContext({
    mode: context.mode === 'ssg' ? 'ssr' : context.mode,
    request,
    signal: context.signal,
    runtime: active?.dataRuntime as import('../data/types').DataRuntime | undefined,
  });
  const runPreload = preload
    ? Promise.resolve(preload({ ...context, params, request, data: prefetch })).then(() => undefined)
    : undefined;
  if (loader) {
    const loaded = runPreload
      ? runPreload.then(() => loader({ ...context, params, request }))
      : loader({ ...context, params, request });
    const finalize = (data: unknown): RouteRenderResult => ({
      kind: 'render',
      handler: createRenderDataAwareHandler(renderHandler, data),
      params,
    });
    return isPromiseLike(loaded)
      ? Promise.resolve(loaded).then(finalize)
      : finalize(loaded);
  }
  if (runPreload) {
    return runPreload.then(() => ({ kind: 'render', handler: renderHandler, params }));
  }
  return { kind: 'render', handler: renderHandler, params };
}

function runPolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  request: Request | undefined,
  start = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = start; index < policies.length; index += 1) {
    const result = policies[index](context);
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then((decision) =>
        decision.kind === 'allow'
          ? runPolicies(policies, context, record, params, request, index + 1)
          : decision);
    }
    if (result.kind !== 'allow') return result;
  }
  return buildRenderResult(record, params, context, request);
}

type PathSetting = string | ((context: RouteContext) => string | PromiseLike<string>);

function resolvePath(value: PathSetting | undefined, fallback: string, context: RouteContext) {
  return typeof value === 'function' ? value(context) : value ?? fallback;
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
  const setting = decision.reason === 'unauthenticated'
    ? options?.loginPath
    : options?.authenticatedRedirectTo;
  const target = resolvePath(setting, decision.reason === 'unauthenticated' ? '/login' : '/', context);
  const finalize = (path: string): AccessDecision => ({
    kind: 'redirect',
    to: decision.reason === 'unauthenticated' ? appendNext(path, context.href) : path,
    replace: decision.reason === 'unauthenticated' ? context.mode === 'spa' : true,
  });
  return isPromiseLike(target) ? Promise.resolve(target).then(finalize) : finalize(target);
}

function resolveMatchedRoute(
  record: RouteRecord,
  params: Record<string, string>,
  context: RouteContext,
  authOptions: RouteAuthOptions | undefined,
  request: Request | undefined
): RouteRequestResult | Promise<RouteRequestResult> {
  const continueResolution = (decision?: AuthDecision) => {
    if (decision) {
      const access = mapAuthDecision(decision, context, authOptions);
      if (isPromiseLike(access)) {
        return Promise.resolve(access).then((next) => next.kind === 'allow'
          ? runPolicies(record.options.policies ?? [], context, record, params, request)
          : next);
      }
      if (access.kind !== 'allow') return access;
    }
    return runPolicies(record.options.policies ?? [], context, record, params, request);
  };
  if (!record.options.auth) return continueResolution();
  const decision = record.options.auth(context.auth);
  return isPromiseLike(decision)
    ? Promise.resolve(decision).then(continueResolution)
    : continueResolution(decision);
}

export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions = {}
): RouteRequestResult | Promise<RouteRequestResult> {
  const records = options.manifest?.records ?? getRouteRecords();
  const match = getMatchingRouteRecord(target, records);
  if (!match) return null;
  const mode = options.mode ?? getDefaultRouteMode();
  const signal = options.signal ?? getActiveRenderContext()?.signal ?? new AbortController().signal;
  const authOptions = getActiveRouteAuthOptions(options.auth ?? options.manifest?.auth);
  const base = buildRouteContextBase(target, match.params, { mode, signal });
  const finalize = (authContext: AuthContext) => resolveMatchedRoute(
    match.record,
    match.params,
    buildRouteContext(target, match.params, { mode, signal, authContext }),
    authOptions,
    options.request,
  );
  if (options.authContext) return finalize(options.authContext);
  if (!authOptions?.resolve) return finalize(anonymous());
  const resolved = authOptions.resolve(base);
  return isPromiseLike(resolved)
    ? Promise.resolve(resolved).then(finalize)
    : finalize(resolved);
}
