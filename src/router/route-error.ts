import type {
  AccessDenyDecision,
  RouteErrorProps,
  RouteForbiddenProps,
  RouteHandler,
  RouteRecord,
  RouteRenderResult,
} from '../common/router';
import type { RenderableChild } from '../common/vnode';
import type { JSXElement } from '../common/jsx';
import { jsx } from '../jsx/jsx-runtime';
import type { InternalRouteRecord } from './internal-types';
import { createRouteHandler } from './rendering';

/** Components a record resolved from its declaring route and nearest ancestors. */
export function routeErrorComponent(
  record: RouteRecord
): ((props: RouteErrorProps) => RenderableChild) | undefined {
  return (record as InternalRouteRecord).errorComponent;
}

export function routeForbiddenComponent(
  record: RouteRecord
): ((props: RouteForbiddenProps) => RenderableChild) | undefined {
  return (record as InternalRouteRecord).forbiddenComponent;
}

let retryRoute: () => void = () => undefined;

/**
 * The navigation owner supplies "re-resolve the current location"; the error
 * UI cannot import it (navigation imports resolution, which imports this).
 */
export function configureRouteRetry(retry: () => void): void {
  retryRoute = retry;
}

const errorResults = new WeakMap<object, unknown>();
const deniedRecords = new WeakMap<object, RouteRecord>();

/** True for a result that renders a route's `error` component. */
export function isRouteErrorResult(result: RouteRenderResult): boolean {
  return errorResults.has(result);
}

/** The failure a route error result is showing (undefined for other results). */
export function routeErrorOf(result: RouteRenderResult): unknown {
  return errorResults.get(result);
}

/** Message a server-rendered error page shows for a failure that did not opt in to exposure. */
export const REDACTED_ROUTE_ERROR = 'Route failed to render.';

/** Framework-owned envelope key recording that the server rendered a route's error component. */
export const ROUTE_ERROR_OUTCOME = 're';

/**
 * The error a server-rendered error component receives, and the one the
 * client rebuilds from the transported outcome. Failures reach the page only
 * when they opt in with `expose: true`, as rejected deferred values do.
 */
export function publicRouteError(error: unknown): Error {
  if (
    error instanceof Error &&
    (error as Error & { expose?: unknown }).expose === true
  ) {
    return error;
  }
  return new Error(REDACTED_ROUTE_ERROR);
}

/** JSON transport of a server-rendered error outcome. */
export function routeErrorOutcome(error: Error): { n: string; m: string } {
  return { n: error.name, m: error.message };
}

/** Rebuild the error a server-rendered error page showed, from its transport. */
export function readRouteErrorOutcome(
  framework: Readonly<Record<string, unknown>> | undefined
): Error | undefined {
  const value = framework?.[ROUTE_ERROR_OUTCOME] as
    | { n?: unknown; m?: unknown }
    | undefined;
  if (!value || typeof value !== 'object') return undefined;
  const error = new Error(
    typeof value.m === 'string' ? value.m : REDACTED_ROUTE_ERROR
  );
  if (typeof value.n === 'string') error.name = value.n;
  return error;
}

/**
 * The result a hydrating client mounts when the server rendered the route's
 * `error` component: the same component, with the error the server exposed.
 */
export function createHydratedRouteErrorResult(
  record: RouteRecord,
  params: Record<string, string>,
  error: Error
): RouteRenderResult {
  const result: RouteRenderResult = {
    kind: 'render',
    handler: createRouteErrorHandler(record, error)!,
    params,
  };
  Object.defineProperty(result, 'record', { value: record, enumerable: false });
  markRouteErrorResult(result, error);
  return result;
}

/** Render the route's `error` component in the leaf slot, inside its layouts. */
export function createRouteErrorHandler(
  record: RouteRecord,
  error: unknown
): RouteHandler | undefined {
  const component = routeErrorComponent(record);
  if (!component) return undefined;
  const ErrorLeaf = () => component({ error, retry: () => retryRoute() });
  return createRouteHandler(
    ErrorLeaf,
    record.pageChain,
    record.layoutChain,
    true
  );
}

const errorRoots = new WeakSet<object>();

/** Whether a mounted root currently renders a route's `error` component. */
export function rootRendersRouteError(root: object): boolean {
  return errorRoots.has(root);
}

export function setRootRendersRouteError(root: object, value: boolean): void {
  if (value) errorRoots.add(root);
  else errorRoots.delete(root);
}

export function markRouteErrorResult(
  result: RouteRenderResult,
  error?: unknown
): void {
  errorResults.set(result, error);
}

/** Remember the route that denied a request, for its `forbidden` component. */
export function markDeniedRoute(
  decision: AccessDenyDecision,
  record: RouteRecord
): void {
  deniedRecords.set(decision, record);
}

/** The route whose `forbidden` component a denial renders, if it declared one. */
export function deniedRouteRecord(
  decision: AccessDenyDecision
): RouteRecord | undefined {
  return deniedRecords.get(decision);
}

/** The placeholder a denied route renders in place of protected content. */
export function createDeniedStatusNode(status: number): JSXElement {
  return jsx('div', {
    'data-route-denied': String(status),
    children: [String(status)],
  });
}

/** Render a denial: the declaring route's `forbidden` component, else the placeholder. */
export function createDeniedHandler(
  decision: Pick<AccessDenyDecision, 'status'>
): RouteHandler {
  const record = deniedRecords.get(decision);
  const component = record ? routeForbiddenComponent(record) : undefined;
  if (!component) return () => createDeniedStatusNode(decision.status);
  const status = decision.status;
  return () => component({ status });
}
