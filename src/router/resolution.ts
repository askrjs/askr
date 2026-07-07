import type {
  RouteContext,
  RouteHandler,
  RouteOptions,
  RoutePolicy,
  RouteRecord,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
} from '../common/router';
import { isPromiseLike } from '../common/promise';
import { getActiveRenderContext } from '../common/render-context';
import { buildRouteContext, buildRouteContextBase } from './route-context';
import { compileNodePolicies } from './access';
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

function getRoutePolicies(
  options: RouteOptions | undefined
): readonly RoutePolicy[] {
  if (!options) {
    return [];
  }

  if (options.policies?.length) {
    return options.policies;
  }

  return compileNodePolicies(options);
}

function getDefaultRouteMode(): RouteContext['mode'] {
  if (typeof window !== 'undefined') {
    return 'spa';
  }

  return 'ssr';
}

function createRenderDataAwareHandler(
  handler: RouteHandler,
  data: unknown
): RouteHandler {
  return (params, context) => {
    const renderContext = getActiveRenderContext();
    if (renderContext) {
      renderContext.renderData = (data ?? null) as Record<
        string,
        unknown
      > | null;
    }

    return handler(params, context);
  };
}

function buildRenderResult(
  record: RouteRecord,
  params: Record<string, string>,
  mode: RouteContext['mode']
): RouteRequestResult | Promise<RouteRequestResult> {
  const renderHandler = getRenderHandler(record);
  const loader = mode === 'ssr' ? record.options?.loader : undefined;
  if (loader) {
    const loaded = loader({ params });
    const finalize = (data: unknown): RouteRenderResult => ({
      kind: 'render',
      handler: createRenderDataAwareHandler(renderHandler, data),
      params,
    });

    if (isPromiseLike(loaded)) {
      return Promise.resolve(loaded).then((data) => finalize(data));
    }

    return finalize(loaded);
  }

  return {
    kind: 'render',
    handler: renderHandler,
    params,
  };
}

function continueRoutePolicies(
  policies: readonly RoutePolicy[],
  context: RouteContext,
  record: RouteRecord,
  params: Record<string, string>,
  startIndex = 0
): RouteRequestResult | Promise<RouteRequestResult> {
  for (let index = startIndex; index < policies.length; index += 1) {
    const policyResult = policies[index](context);

    if (isPromiseLike(policyResult)) {
      return Promise.resolve(policyResult).then((next) => {
        if (next.kind !== 'allow') {
          return next;
        }

        return continueRoutePolicies(
          policies,
          context,
          record,
          params,
          index + 1
        );
      });
    }

    if (policyResult.kind !== 'allow') {
      return policyResult;
    }
  }

  return buildRenderResult(record, params, context.mode);
}

export function resolveRouteRequest(
  target: string,
  options: RouteRequestOptions = {}
): RouteRequestResult | Promise<RouteRequestResult> {
  const routeRecords = options.manifest?.records ?? getRouteRecords();
  const match = getMatchingRouteRecord(target, routeRecords);

  if (!match) {
    return null;
  }

  const { record, params } = match;
  const policies = getRoutePolicies(record.options);
  const mode = options.mode ?? getDefaultRouteMode();

  if (policies.length === 0) {
    return buildRenderResult(record, params, mode);
  }

  const signal =
    options.signal ??
    getActiveRenderContext()?.signal ??
    new AbortController().signal;
  const auth = getActiveRouteAuthOptions(
    options.auth ?? options.manifest?.auth
  );
  const baseContext = buildRouteContextBase(target, params, {
    mode,
    signal,
  });

  const finalize = (authState: { session: unknown; user: unknown }) =>
    continueRoutePolicies(
      policies,
      buildRouteContext(target, params, {
        mode,
        signal,
        auth,
        session: authState.session,
        user: authState.user,
      }),
      record,
      params
    );

  if (!auth?.resolve) {
    return finalize({ session: null, user: null });
  }

  const authState = auth.resolve(baseContext);
  if (isPromiseLike(authState)) {
    return Promise.resolve(authState).then((next) => finalize(next));
  }

  return finalize(authState);
}
