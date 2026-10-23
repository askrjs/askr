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

const errorResults = new WeakSet<object>();
const deniedRecords = new WeakMap<object, RouteRecord>();

/** True for a result that renders a route's `error` component. */
export function isRouteErrorResult(result: RouteRenderResult): boolean {
  return errorResults.has(result);
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

export function markRouteErrorResult(result: RouteRenderResult): void {
  errorResults.add(result);
}

/** Remember the route that denied a request, for its `forbidden` component. */
export function markDeniedRoute(
  decision: AccessDenyDecision,
  record: RouteRecord
): void {
  deniedRecords.set(decision, record);
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
